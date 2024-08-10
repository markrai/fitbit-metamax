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

function normalizeSeries(series) {
    const mean = series.reduce((acc, val) => acc + val, 0) / series.length;
    const stdDev = Math.sqrt(series.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / series.length);
    
    if (stdDev === 0) {
        return series.map(() => 0); // Return an array of zeros if there's no variation
    }
    
    return series.map(val => (val - mean) / stdDev);
}

function calculateMetaScore(data) {
    const normalizedData = {
        HRV: normalizeSeries(data.map(entry => entry.HRV)),
        Breathing_Rate: normalizeSeries(data.map(entry => entry.Breathing_Rate)),
        Skin_Temperature: normalizeSeries(data.map(entry => entry.Skin_Temperature)),
        Oxygen_Saturation: normalizeSeries(data.map(entry => entry.Oxygen_Saturation)),
        Resting_Heart_Rate: normalizeSeries(data.map(entry => entry.Resting_Heart_Rate))
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

        // Log each response to verify the data structure
        responses.forEach((response, index) => {
            console.log(`Response ${index}: `, response);
        });

        const data = await Promise.all(responses.map(res => res && res.ok ? res.json() : null));

        if (responses.some(res => res && res.status === 401)) {
            console.error('Unauthorized! Refreshing access token.');
            await refreshAccessToken();
            return;
        }

        // Ensure that data[0].hrv exists and is an array before mapping
        if (data[0]?.hrv && Array.isArray(data[0].hrv)) {
            fullData = data[0].hrv.map((entry, index) => ({
                dateTime: entry.dateTime,
                HRV: entry.value.dailyRmssd,
                Breathing_Rate: data[1]?.br?.[index]?.value?.breathingRate || null,
                Skin_Temperature: data[2]?.tempSkin?.[index]?.value?.nightlyRelative || null,
                Oxygen_Saturation: data[3]?.spo2?.[index]?.value?.oxygenSaturation || null,
                Resting_Heart_Rate: data[4]?.['activities-heart']?.[index]?.value?.restingHeartRate || null
            }));

            // Log fullData to verify correct mapping
            console.log("Full Data:", fullData);
        } else {
            console.error('HRV data is missing or in an unexpected format');
            return;
        }

        if (fullData.length > 0) {
            const metaScores = calculateMetaScore(fullData);
            // Log metaScores to check for NaN values
            console.log("Meta Scores before rounding:", metaScores);
            fullData.forEach((entry, index) => entry.metamax = metaScores[index]);

            // Log fullData after adding metamax to check for NaN
            console.log("Full Data with MetaMax:", fullData);
        }

        updateChart(daysToFetch); // Initially display the last `daysToFetch` days

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

// Step 4: Update the chart based on the selected number of days
function updateChart(days) {
    // Slice the last `days` entries instead of the first `days` entries
    const filteredData = fullData.slice(-days); // Get the last `days` entries

    const labels = filteredData.map(entry => entry.dateTime);
    const values = filteredData.map(entry => entry.metamax); // Display the metamax value

    // Debugging output to check if labels and values are correct
    console.log("Labels:", labels);
    console.log("Values:", values);

    const ctx = document.getElementById('hrvChart').getContext('2d');

    // Destroy the existing chart instance if it exists
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
                pointBackgroundColor: '#000', // Solid black dots
                pointRadius: 6, // Size of the dots
                pointHoverRadius: 8, // Size of the dots when hovered
                pointStyle: 'circle', // Circle style
            }]
        },
        options: {
            plugins: {
                datalabels: {
                    color: '#fff', // White text color
                    backgroundColor: '#000', // Black background
                    borderRadius: 4,
                    font: {
                        weight: 'bold'
                    },
                    formatter: function(value) {
                        return Math.round(value); // Correctly display the rounded metamax value
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
                        stepSize: 1, // Increment Y-axis by 1
                        callback: function(value) {
                            return Math.round(value); // Display only integer values
                        }
                    }
                }
            }
        },
        plugins: [ChartDataLabels] // Ensure the plugin is loaded and used here
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

       
