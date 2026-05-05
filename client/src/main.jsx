import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App.jsx';
import StartingPage from './pages/StartingPage.jsx';
import HomePage from './pages/HomePage.jsx';
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import LandingPage from './pages/LandingPage.jsx';
import AboutUs from './pages/AboutUs.jsx';
import ContactUs from './pages/ContactUs.jsx';
import './App.css';
import AuthSuccess from './pages/AuthSuccess';
import AuthCallback from './pages/AuthCallback'; 
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';


// In your Routes component


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StartingPage onEnter={() => {
          window.location.href = '/home';
        }} />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/about" element={<AboutUs />} />
        <Route path="/contact" element={<ContactUs />} />
        <Route path="/dashboard" element={<LandingPage />} />
        <Route path="/room/:roomId" element={<App />} />
        <Route path="*" element={<Navigate to="/" />} />
        <Route path="/auth/success" element={<AuthSuccess />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);