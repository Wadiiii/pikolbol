import { auth, db, dashboardPath, getProfile, logActivity, friendlyError, showAlert, setLoading } from './app.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';

const form = document.getElementById('login-form');
const alertBox = document.getElementById('alert');
const button = form.querySelector('button[type="submit"]');
const params = new URLSearchParams(location.search);
let submitting = false;

if (params.has('registered')) {
    showAlert(alertBox, 'success', 'Account created! You can now log in.');
} else if (params.has('logged_out')) {
    showAlert(alertBox, 'success', 'You have been logged out.');
} else if (params.has('disabled')) {
    showAlert(alertBox, 'error', 'Your account is not active. Please contact the administrator.');
}

const stop = onAuthStateChanged(auth, async (user) => {
    stop();
    if (!user || submitting) {
        return;
    }
    const profile = await getProfile(user.uid);
    if (profile && profile.status === 'active') {
        location.replace(dashboardPath(profile.role));
    }
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = form.email.value.trim().toLowerCase();
    const password = form.password.value;

    if (!email || !password) {
        showAlert(alertBox, 'error', 'Please enter your email and password.');
        return;
    }

    submitting = true;
    setLoading(button, true, 'Logging in...');
    showAlert(alertBox, 'error', '');

    try {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        const profile = await getProfile(credential.user.uid);

        if (!profile) {
            await signOut(auth);
            throw { code: 'custom', message: 'Your account profile was not found. Please register again or contact the administrator.' };
        }

        if (profile.status !== 'active') {
            await signOut(auth);
            throw { code: 'custom', message: 'Your account is ' + profile.status + '. Please contact the administrator.' };
        }

        await updateDoc(doc(db, 'users', credential.user.uid), { lastLogin: serverTimestamp() });
        await logActivity('LOGIN', 'User logged in.', profile.firstName + ' ' + profile.lastName);

        location.replace(dashboardPath(profile.role));
    } catch (error) {
        submitting = false;
        showAlert(alertBox, 'error', error.code === 'custom' ? error.message : friendlyError(error));
        setLoading(button, false);
    }
});