# Fitbit MetaMax
The Fitbit MetaMax App is designed to provide users with a comprehensive wellness score based on multiple health metrics obtained via the Fitbit API. By combining and analyzing key physiological data, the app delivers a single, easy-to-understand score that reflects your overall well-being, going beyond what any individual metric could offer on its own.

# Features
This app queries the Fitbit API to retrieve the following health metrics over a specified period:

- Resting Heart Rate (RHR)
- Oxygen Saturation (O2 Saturation)
- Heart Rate Variability (HRV)
- Skin Temperature
- Breathing Rate

# The MetaMax Score

The app calculates a wellness score, called the MetaMax score, which integrates these five metrics into a single, normalized value that is easy to interpret:

Weighted Aggregation: Each metric is assigned a specific weight based on its relevance to overall well-being. For instance, HRV might be given a higher weight because of its strong correlation with stress and recovery.

Normalization: The app normalizes each metric, adjusting for individual baselines and ensuring that the scores are relative to your own data. This way, the MetaMax score reflects your personal health trends rather than comparing you to a general population.

Calculation: After weighting and normalizing the metrics, the app sums these values to produce a daily MetaMax score. This score is then rounded to the nearest integer to make it more interpretable:

Positive Integers: Suggest better-than-baseline well-being, indicating that your body is in a state of recovery or optimal functioning.

Negative Integers: Suggest below-baseline well-being, potentially indicating stress, fatigue, or other factors affecting your health.

![image](https://github.com/user-attachments/assets/dd1db0b7-7b6b-48bf-8152-76aba078bf5f)

# Getting Started

1. Authorize the App: The first step is to authorize the app to access your Fitbit data - you will need to create a personal application on https://dev.fitbit.com

2. You can test it out in an IDE such as VS Code, using Live Server.

3. Set the Period: Choose the number of days over which you want to analyze your metrics.

4. Enjoy! 😁
