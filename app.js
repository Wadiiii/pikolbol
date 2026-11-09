import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import {
    getFirestore,
    doc,
    getDoc,
    addDoc,
    collection,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export function dashboardPath(role) {
    if (role === 'super_admin') {
        return 'superadmin_dashboard.html';
    }
    if (role === 'admin') {
        return 'admin_dashboard.html';
    }
    return 'user_dashboard.html';
}

export function waitForAuth() {
    return new Promise((resolve) => {
        const stop = onAuthStateChanged(auth, (user) => {
            stop();
            resolve(user);
        });
    });
}

export async function getProfile(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function requireRole(roles) {
    const user = await waitForAuth();

    if (!user) {
        location.replace('login.html');
        return new Promise(() => {});
    }

    const profile = await getProfile(user.uid);

    if (!profile || profile.status !== 'active') {
        await signOut(auth);
        location.replace('login.html?disabled=1');
        return new Promise(() => {});
    }

    if (!roles.includes(profile.role)) {
        location.replace(dashboardPath(profile.role));
        return new Promise(() => {});
    }

    return profile;
}

export async function logActivity(action, details = '', name = '') {
    const user = auth.currentUser;
    if (!user) {
        return;
    }
    try {
        await addDoc(collection(db, 'activity_logs'), {
            userId: user.uid,
            userName: name,
            action: action,
            details: details,
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.warn('Could not save activity log:', error);
    }
}

export async function logout() {
    await logActivity('LOGOUT', 'User logged out.');
    await signOut(auth);
    location.replace('login.html?logged_out=1');
}

export function friendlyError(error) {
    const messages = {
        'auth/invalid-credential': 'Incorrect email or password.',
        'auth/wrong-password': 'Incorrect email or password.',
        'auth/user-not-found': 'Incorrect email or password.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/email-already-in-use': 'This email is already registered.',
        'auth/weak-password': 'Password is too weak.',
        'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
        'auth/network-request-failed': 'No internet connection. Please try again.',
        'auth/requires-recent-login': 'Please log in again before doing this.',
        'permission-denied': 'You don\'t have permission to do that.',
        'unavailable': 'Can\'t reach the server. Check your internet connection.'
    };
    return messages[error && error.code] || 'Something went wrong. Please try again.';
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const alertIcons = {
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>',
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
};

export function showAlert(container, type, message) {
    if (!container) {
        return;
    }
    if (!message) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = '<div class="alert alert-' + type + '" role="' + (type === 'error' ? 'alert' : 'status') + '">'
        + alertIcons[type] + '<span>' + escapeHtml(message) + '</span></div>';
}

export function setFieldError(form, name, message) {
    const input = form.elements[name];
    if (!input) {
        return;
    }
    const field = input.closest('.field');
    const old = field.querySelector('.error-text');
    if (old) {
        old.remove();
    }
    field.classList.toggle('has-error', Boolean(message));
    if (message) {
        const span = document.createElement('span');
        span.className = 'error-text';
        span.textContent = message;
        field.appendChild(span);
    }
}

export function clearFieldErrors(form) {
    form.querySelectorAll('.field').forEach((field) => {
        field.classList.remove('has-error');
        const old = field.querySelector('.error-text');
        if (old) {
            old.remove();
        }
    });
}

export function setLoading(button, loading, text) {
    if (!button.dataset.label) {
        const label = button.querySelector('.btn-text');
        button.dataset.label = label ? label.textContent : button.textContent;
    }
    const label = button.querySelector('.btn-text') || button;
    button.disabled = loading;
    label.textContent = loading ? text : button.dataset.label;
}