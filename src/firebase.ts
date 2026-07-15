import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "arc-delay-sena",
  appId: "1:923738836745:web:5461c1dbbc93a4c90fcdd8",
  storageBucket: "arc-delay-sena.firebasestorage.app",
  apiKey: "AIzaSyC9Auf86if4tb6q5Sh4v5OdbIP6s9TFeb4",
  authDomain: "arc-delay-sena.firebaseapp.com",
  messagingSenderId: "923738836745"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
