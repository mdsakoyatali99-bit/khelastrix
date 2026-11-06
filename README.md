# 🎮 Khelastrix - Professional Gaming Tournament Platform

Khelastrix is a high-performance, secure, and modern gaming tournament web application designed for low-bandwidth environments with stunning glassmorphism aesthetics and PWA support.

---

## ✨ Key Features

- **📱 Progressive Web App (PWA):** Fully installable on Android mobile devices directly from the browser as a native-like standalone app (`manifest.json` & Service Worker).
- **🎨 Pure SVG & Animated Logo:** Lightweight, responsive branding and UI elements created entirely using SVG and CSS/SMIL animations without heavy external image files.
- **🔒 Secure Admin Panel (`/admin`):** Client-side routing secured with session/JWT authentication, brute-force protection, and rate-limiting.
- **💳 Dynamic Auto-Payment SMS Gateway:** Integrated API Key / Reader Key manager allowing admins to connect multiple Android phones running background SMS readers to automatically verify bKash, Nagad, and Rocket payments via Firebase.
- **🔥 Firebase Integration:** Powered by Firebase Auth and Realtime Database/Firestore for real-time match synchronization, user wallets, and leaderboards.
- **🕹️ Custom Game Architecture:** Built-in modular structure prepared for custom-built Ludo and Carrom Board games (1v1, 2v2, 4-player) with secure token validation.
- **🛡️ Security:** Built-in protection against XSS, CSRF, and SMS bombing (cooldown timers and daily limits).

---

## 🛠️ Tech Stack

- **Frontend:** HTML5, Modern CSS3 (Glassmorphism, Dark Theme), Vanilla JavaScript (Modular ES6)
- **Backend & Database:** Firebase (Cloud Functions, Realtime Database, Authentication)
- **PWA:** Service Workers, Web App Manifest

---

## ⚙️ Configuration & Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/your-username/khelastrix.git](https://github.com/your-username/khelastrix.git)
   cd khelastrix
