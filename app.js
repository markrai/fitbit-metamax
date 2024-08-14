const CLIENT_ID = '';
const CLIENT_SECRET = '';
const REDIRECT_URI = '';

let fullData = []; // Store the full days of all metrics data

// Step 1: Redirect the user to Fitbit's authorization page
function authorize() {
    const authUrl = `https://www.fitbit.com/oauth2/authorize?response_type=code&client_id=23PN2C&redirect_uri=http%3A%2F%2F127.0.0.1%3A8080%2F&scope=heartrate%20respiratory_rate%20temperature%20oxygen_saturation&expires_in=604800`;
    window.location.href = authUrl;
}

// Step 2: Exchange the authorization code for an access token
async function getAccessToken() {
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) {
        authorize();
        return;
    }

    try {
        const tokenUrl = 'https://api.fitbit.com/oauth2/token';
        const body = new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI,
            code: code
        });

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString()
        });

        const data = await response.json();

        if (response.ok) {
            console.log('Access Token:', data.access_token);
            localStorage.setItem('fitbit_access_token', data.access_token);
            localStorage.setItem('fitbit_refresh_token', data.refresh_token); // Save the refresh token
            fetchAndDisplayData(data.access_token);
        } else {
            console.error('Error fetching access token', data);
            alert("Failed to retrieve access token. Please try again.");
        }
    } catch (error) {
        console.error('Error during token exchange', error);
        alert("An unexpected error occurred. Please try again.");
    }
}

async function refreshAccessToken() {
    const refreshToken = localStorage.getItem('fitbit_refresh_token');
    if (!refreshToken) {
        console.error('No refresh token available');
        authorize(); // Re-authorize if no refresh token
        return;
    }

    try {
        const tokenUrl = 'https://api.fitbit.com/oauth2/token';
        const body = new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        });

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString()
        });

        const data = await response.json();

        if (response.ok) {
            console.log('New Access Token:', data.access_token);
            localStorage.setItem('fitbit_access_token', data.access_token);
            localStorage.setItem('fitbit_refresh_token', data.refresh_token);
            fetchAndDisplayData(data.access_token);
        } else {
            console.error('Error refreshing access token', data);
            authorize(); // Re-authorize if refreshing fails
        }
    } catch (error) {
        console.error('Error during token refresh', error);
        authorize(); // Re-authorize if an error occurs
    }
}

async function refreshAccessToken() {
    const refreshToken = localStorage.getItem('fitbit_refresh_token');
    if (!refreshToken) {
        console.error('No refresh token available');
        authorize(); // Re-authorize if no refresh token
        return;
    }

    const tokenUrl = 'https://api.fitbit.com/oauth2/token';
    const body = new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
    });

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
    });

    const data = await response.json();

    if (response.ok) {
        console.log('New Access Token:', data.access_token);
        localStorage.setItem('fitbit_access_token', data.access_token);
        localStorage.setItem('fitbit_refresh_token', data.refresh_token);
        fetchAndDisplayData(data.access_token);
    } else {
        console.error('Error refreshing access token', data);
        authorize(); // Re-authorize if refreshing fails
    }
}

function normalizeSeries(series, invert = false) {
    const mean = series.reduce((acc, val) => acc + val, 0) / series.length;
    const stdDev = Math.sqrt(series.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / series.length);
    
    const epsilon = 1e-8; // Small value to avoid division by zero
    
    if (stdDev === 0) {
        return series.map(() => 0); // Return an array of zeros if there's no variation
    }
    
    const normalized = series.map(val => (val - mean) / (stdDev + epsilon)); // Add epsilon to avoid zero division
    
    return invert ? normalized.map(val => -val) : normalized;
}


function calculateBaseline(series) {
    // For simplicity, let's assume the baseline is the average of the series
    return series.reduce((acc, val) => acc + val, 0) / series.length;
}



function calculateMetaScore(data) {
    const skinTemperatureBaseline = calculateBaseline(data.map(entry => entry.Skin_Temperature));
    const normalizedData = {
        HRV: normalizeSeries(data.map(entry => entry.HRV)),
        Breathing_Rate: normalizeSeries(data.map(entry => entry.Breathing_Rate), true), 
        Skin_Temperature: data.map(entry => (entry.Skin_Temperature - skinTemperatureBaseline) / skinTemperatureBaseline),
        Oxygen_Saturation: normalizeSeries(data.map(entry => entry.Oxygen_Saturation)),
        Resting_Heart_Rate: normalizeSeries(data.map(entry => entry.Resting_Heart_Rate), true) 
    };
    

    const weights = {
        HRV: 0.3,
        Breathing_Rate: 0.2,
        Skin_Temperature: 0.2,
        Oxygen_Saturation: 0.1,
        Resting_Heart_Rate: 0.2
    };

    // Calculate Meta Score and apply scaling before rounding
    const metaScores = data.map((_, index) => {
        const metaScore = (
            normalizedData.HRV[index] * weights.HRV +
            normalizedData.Breathing_Rate[index] * weights.Breathing_Rate +
            normalizedData.Skin_Temperature[index] * weights.Skin_Temperature +
            normalizedData.Oxygen_Saturation[index] * weights.Oxygen_Saturation +
            normalizedData.Resting_Heart_Rate[index] * weights.Resting_Heart_Rate
        );
        
        // Apply scaling or transformation before rounding
        return Math.round(metaScore * 10); // Multiply by 10 before rounding to introduce more granularity
    });

    return metaScores;
}

// Step 3: Fetch the specified number of days of HRV and other data from Fitbit
async function fetchFitbitData(accessToken, daysToFetch) {
    const today = new Date().toISOString().split('T')[0];
    const startDate = new Date(new Date().setDate(new Date().getDate() - daysToFetch)).toISOString().split('T')[0];

    const endpoints = [
        `https://api.fitbit.com/1/user/-/hrv/date/${startDate}/${today}.json`,         // HRV data
        `https://api.fitbit.com/1/user/-/br/date/${startDate}/${today}.json`,          // Breathing Rate data
        `https://api.fitbit.com/1/user/-/temp/skin/date/${startDate}/${today}.json`,   // Skin Temperature data
        `https://api.fitbit.com/1/user/-/spo2/date/${startDate}/${today}.json`,        // Oxygen Saturation data
        `https://api.fitbit.com/1/user/-/activities/heart/date/${startDate}/${today}.json` // Resting Heart Rate data
    ];

    try {
        const responses = await Promise.all(endpoints.map(endpoint => fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        })));

        // Log each response status to verify the data structure
        responses.forEach((response, index) => {
            console.log(`Response ${index} status: `, response.status);
        });

        // Parse the JSON responses if the request was successful
        const data = await Promise.all(responses.map((res, index) => {
            if (res && res.ok) {
                return res.json();
            } else {
                console.error(`Error in response ${index}:`, res);
                return null;
            }
        }));

        // Check if any response returned a 401 status, indicating an authorization issue
        if (responses.some(res => res && res.status === 401)) {
            console.error('Unauthorized! Refreshing access token.');
            await refreshAccessToken();
            return;
        }

        // Log the structure of the returned data to identify any issues
        data.forEach((dataset, index) => {
            console.log(`Data ${index} structure: `, dataset);
        });

        // Extract data streams and handle cases where the data might be missing
        const hrvData = data[0]?.hrv || [];
        const brData = data[1]?.br || [];
        const tempSkinData = data[2]?.tempSkin || [];
        const spo2Data = data[3]?.spo2 || [];  // This might be an empty array if not available
        const heartData = data[4]?.['activities-heart'] || [];

        // Log the potentially missing Oxygen Saturation data
        console.log("Oxygen Saturation Data:", spo2Data);

        // Map the data if all expected streams are available
        if (Array.isArray(hrvData) && Array.isArray(brData) && Array.isArray(tempSkinData) &&
            Array.isArray(spo2Data) && Array.isArray(heartData)) {

            fullData = hrvData.map((entry, index) => ({
                dateTime: entry.dateTime,
                HRV: entry.value.dailyRmssd,
                Breathing_Rate: brData[index]?.value?.breathingRate || null,
                Skin_Temperature: tempSkinData[index]?.value?.nightlyRelative || null,
                Oxygen_Saturation: spo2Data[index]?.value?.oxygenSaturation || null,  // Set to null if undefined
                Resting_Heart_Rate: heartData[index]?.restingHeartRate || null
            }));

            // Log fullData to verify correct mapping
            console.log("Full Data:", fullData);

            // If the fullData array is populated, calculate the MetaMax scores
            if (fullData.length > 0) {
                const metaScores = calculateMetaScore(fullData);
                // Log metaScores to check for NaN values or unexpected results
                console.log("Meta Scores before rounding:", metaScores);

                fullData.forEach((entry, index) => entry.metamax = metaScores[index]);

                // Log fullData after adding metamax to check for NaN or inconsistencies
                console.log("Full Data with MetaMax:", fullData);
            } else {
                console.warn('No data available to process after mapping.');
            }

            // Update the chart with the fetched and processed data
            updateChart(daysToFetch); // Initially display the last `daysToFetch` days
        } else {
            console.error('One or more Fitbit data streams are missing or in an unexpected format');
            if (!Array.isArray(hrvData)) console.error('HRV data is not in expected format or is missing.');
            if (!Array.isArray(brData)) console.error('Breathing Rate data is not in expected format or is missing.');
            if (!Array.isArray(tempSkinData)) console.error('Skin Temperature data is not in expected format or is missing.');
            if (!Array.isArray(spo2Data)) console.error('Oxygen Saturation data is not in expected format or is missing.');
            if (!Array.isArray(heartData)) console.error('Resting Heart Rate data is not in expected format or is missing.');
        }

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}



// Step 4: Update the chart based on the selected number of days
function updateChart(days) {
    const filteredData = fullData.slice(-days); // Get the last `days` entries

    if (filteredData.length === 0) {
        console.warn('No data available for the selected time range.');
        return;
    }

    // Function to format date as "DayOfWeek MM/DD"
    function formatDateLabel(dateString) {
        const date = new Date(dateString);
        const options = { weekday: 'short', month: '2-digit', day: '2-digit' };
        return date.toLocaleDateString('en-US', options);
    }

    // Create labels using the formatted date
    const labels = filteredData.map(entry => formatDateLabel(entry.dateTime));
    const values = filteredData.map(entry => entry.metamax);

    const ctx = document.getElementById('hrvChart').getContext('2d');

    if (hrvChart) {
        hrvChart.destroy();
    }

    hrvChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'MetaMax Score',
                data: values,
                borderColor: '#3e95cd',
                fill: false,
                pointBackgroundColor: '#000',
                pointRadius: 6,
                pointHoverRadius: 8,
                pointStyle: 'circle',
            }]
        },
        options: {
            plugins: {
                datalabels: {
                    color: '#fff',
                    backgroundColor: '#000',
                    borderRadius: 4,
                    font: {
                        weight: 'bold'
                    },
                    formatter: function(value) {
                        return Math.round(value);
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: false,
                    ticks: {
                        color: 'black'
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: 'black',
                        stepSize: 1,
                        callback: function(value) {
                            return Math.round(value);
                        }
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}



// Step 5: Fetch data and display it initially, and allow the user to switch between time ranges
let hrvChart; // Reference to the chart instance

function fetchAndDisplayData(accessToken) {
    const days = parseInt(document.getElementById('daysSelector').value); // Get the selected number of days
    fetchFitbitData(accessToken, days); // Fetch the data for the selected number of days
}

// Fetch the access token from local storage or handle authorization
function handleCallback() {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
        getAccessToken(); // This will handle the OAuth code and exchange it for an access token
    } else {
        const accessToken = localStorage.getItem('fitbit_access_token');
        if (accessToken) {
            fetchAndDisplayData(accessToken);
        } else {
            authorize(); // Redirects to Fitbit if no access token or code is found
        }
    }
}

handleCallback();

       
