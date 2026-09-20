KOM AI — CLOUD + ANDROID PACKAGE

1) Upload this project to a GitHub repository.
2) In Render, create a Web Service from that repository.
3) Root Directory: backend
   Build Command: npm install
   Start Command: npm start
4) Add environment variable:
   OPENAI_API_KEY = your OpenAI API key
   OPENAI_MODEL = gpt-5.6-luna
5) After deployment, Render gives a URL like:
   https://kom-ai-xxxx.onrender.com
6) Put that HTTPS URL in:
   android/KOM_AI_ANDROID/app/src/main/res/values/strings.xml
   replacing YOUR-KOM-AI-URL.
7) Open android/KOM_AI_ANDROID in Android Studio.
8) Build > Generate App Bundle / APK > Generate APK.

IMPORTANT: Never put the OpenAI API key inside the Android app. Keep it only in Render environment variables.
