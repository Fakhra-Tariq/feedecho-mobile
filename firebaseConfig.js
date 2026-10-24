import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyBbQFz2Cy0sVTo1eZXh5gt0WWm_diJUI1I",
    authDomain: "feedecho-44f70.firebaseapp.com",
    databaseURL: "https://feedecho-44f70-default-rtdb.firebaseio.com",
    projectId: "feedecho-44f70",
    storageBucket: "feedecho-44f70.firebasestorage.app",
    messagingSenderId: "96902837492",
    appId: "1:96902837492:web:45412652693a0b0ed15aa1",
    measurementId: "G-HSR6E6FV7B"
  };

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);

// Mobile par login save rakhne ke liye (app band karke kholo to logout na ho).
// Web (including Expo's static render) does not provide getReactNativePersistence.
export const auth =
  Platform.OS === "web"
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(ReactNativeAsyncStorage),
      });

export default app;