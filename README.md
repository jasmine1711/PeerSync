# PeerSync

PeerSync is a full-stack, real-time collaborative coding platform designed to make remote pair programming seamless and interactive. It replaces traditional screen-sharing workflows with a shared coding environment, integrated video communication, and intelligent assistance—all within a single browser session.

## 🚀 Overview

PeerSync enables multiple users to join shared rooms where they can collaboratively write, execute, and discuss code in real time. The platform is built on a server-mediated architecture, ensuring synchronized state, role-based control, and consistent multi-user interaction across sessions. 

## ✨ Key Features

* **Real-time Collaborative Editor**
  Code updates are synchronized instantly across users using Socket.IO with sub-second latency.

* **Driver/Navigator Role System**
  Structured pair programming model where only the Driver can edit code, ensuring disciplined collaboration.

* **Integrated Video Calling (Jitsi)**
  Embedded video communication directly inside the coding room with JWT-based authentication.

* **Bilingual Live Captions (EN + HI)**
  Real-time speech transcription and translation using Web Speech API and backend translation pipeline.

* **AI-Powered Session Summary**
  Generates structured summaries, logic explanations, and flashcard-based Q&A using Gemini API.

* **Multi-language Code Execution**
  Supports Java, Python, JavaScript, and C++ via a sandboxed execution engine (Piston with Docker).

* **Authentication System**
  JWT-based login, refresh tokens, email verification, and secure session handling.

* **Room-based Collaboration**
  Multiple independent rooms can run simultaneously with isolated real-time state management.

## 🏗️ Architecture

PeerSync follows a **server-mediated client-server model**, where all communication (code updates, captions, video signals, AI data) is routed through the backend using Socket.IO. This ensures consistency, scalability, and proper access control across all users in a room. 

## 🛠️ Tech Stack

* **Frontend:** React 18, Vite
* **Backend:** Node.js, Express
* **Real-time Communication:** Socket.IO
* **Video Calling:** Jitsi Meet API
* **Code Editor:** Monaco Editor
* **AI Integration:** Gemini API
* **Database:** MongoDB
* **Execution Engine:** Piston (Docker)
* **Authentication:** JWT

## 👨‍💻 My Contribution

* Initiated the project and developed core architecture
* Implemented real-time collaboration logic and room management
* Currently working on cloud deployment, scalability, and production-ready infrastructure

## 🌐 Deployment (In Progress)

Working towards deploying the platform with:

* Public access via cloud hosting
* Multi-user real-time interaction across networks
* Scalable room-based architecture
