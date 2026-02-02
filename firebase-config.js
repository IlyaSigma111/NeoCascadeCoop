import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { 
    getAuth, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { 
    getDatabase, 
    ref, 
    set, 
    get, 
    update, 
    onValue, 
    push, 
    remove, 
    onChildAdded, 
    onChildChanged 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyAoZollSKuSUr3GG4eYOdz5AxgUGf304HI",
    authDomain: "neocascadecoop.firebaseapp.com",
    databaseURL: "https://neocascadecoop-default-rtdb.firebaseio.com",
    projectId: "neocascadecoop",
    storageBucket: "neocascadecoop.firebasestorage.app",
    messagingSenderId: "624760450085",
    appId: "1:624760450085:web:1db92536b7ab4d1b5963cc"
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
const provider = new GoogleAuthProvider();

// Добавляем scope для получения email
provider.addScope('email');
provider.addScope('profile');

export { 
    auth, 
    database, 
    provider, 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged,
    ref, 
    set, 
    get, 
    update, 
    onValue, 
    push, 
    remove, 
    onChildAdded, 
    onChildChanged 
};
