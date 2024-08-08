const CLIENT_ID = '';
const CLIENT_SECRET = '';
const REDIRECT_URI = '';

let fullData = []; // Store the full 30 days of HRV data

// Step 1: Redirect the user to Fitbit's authorization page
function authorize() {
    const authUrl = `https://www.fitbit.com/oauth2/authorize?response_type=code&client_id=23PN2C&redirect_uri=http%3A%2F%2F127.0.0.1%3A8080%2F&scope=heartrate&expires_in=604800`;
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

async function fetchHRVData(accessToken) {
    const today = new Date().toISOString().split('T')[0];
    const startDate = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];

    const response = await fetch(`https://api.fitbit.com/1/user/-/hrv/date/${startDate}/${today}.json`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (response.status === 401) {
        console.error('Unauthorized! Refreshing access token.');
        await refreshAccessToken();
        return;
    }

    const data = await response.json();
    console.log('HRV Data:', data);

    fullData = data.hrv || [];
    updateChart(7); // Initially display the last 7 days
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

// Step 3: Fetch 30 days of HRV data from Fitbit
async function fetchHRVData(accessToken) {
    const today = new Date().toISOString().split('T')[0];
    const startDate = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];
    
    const response = await fetch(`https://api.fitbit.com/1/user/-/hrv/date/${startDate}/${today}.json`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });
    
    const data = await response.json();
    console.log('HRV Data:', data);

    if (response.status === 401) {
        console.error('Unauthorized! Check if the access token is valid.');
        return [];
    }

    fullData = data.hrv || [];
    updateChart(7); // Initially display the last 7 days
}

// Step 4: Update the chart based on the selected number of days
function updateChart(days) {
    const filteredData = fullData.slice(-days); // Get the last `days` entries

    const labels = filteredData.map(entry => entry.dateTime);
    const values = filteredData.map(entry => entry.value.dailyRmssd); // Use the correct key based on API response

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
                label: 'Milliseconds (ms)',
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
                        return value.toFixed(1); // Format the label text
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
                        color: 'black'
                    }
                }
            }
        },
        plugins: [ChartDataLabels] // Make sure the plugin is loaded and used here
    });
}

// Step 5: Fetch data and display it initially, and allow the user to switch between time ranges
let hrvChart; // Reference to the chart instance

function fetchAndDisplayData(accessToken) {
    if (fullData.length === 0) {
        fetchHRVData(accessToken); // Fetch 30 days of data if not already fetched
    } else {
        const days = document.getElementById('daysSelector').value;
        updateChart(days);
    }
}

