import { auth, db, logActivity, friendlyError, showAlert, setFieldError, clearFieldErrors, setLoading } from './app.js';
import { createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';

const form = document.getElementById('register-form');
const alertBox = document.getElementById('alert');
const button = form.querySelector('button[type="submit"]');

function validate(data) {
    const errors = {};

    if (!data.firstName) {
        errors.first_name = 'First name is required.';
    } else if (data.firstName.length > 50) {
        errors.first_name = 'First name is too long.';
    }

    if (!data.lastName) {
        errors.last_name = 'Last name is required.';
    } else if (data.lastName.length > 50) {
        errors.last_name = 'Last name is too long.';
    }

    if (!data.email) {
        errors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.email.length > 100) {
        errors.email = 'Please enter a valid email address.';
    }

    if (data.phone && !/^(09|\+639)\d{9}$/.test(data.phone)) {
        errors.phone = 'Use the format 09XXXXXXXXX.';
    }

    if (data.password.length < 8 || !/[A-Za-z]/.test(data.password) || !/\d/.test(data.password)) {
        errors.password = 'At least 8 characters with letters and numbers.';
    }

    if (data.confirm !== data.password) {
        errors.confirm_password = 'Passwords do not match.';
    }

    return errors;
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors(form);
    showAlert(alertBox, 'error', '');

    const data = {
        firstName: form.first_name.value.trim(),
        lastName: form.last_name.value.trim(),
        email: form.email.value.trim().toLowerCase(),
        phone: form.phone.value.trim(),
        password: form.password.value,
        confirm: form.confirm_password.value
    };

    const errors = validate(data);
    if (Object.keys(errors).length) {
        Object.entries(errors).forEach(([name, message]) => setFieldError(form, name, message));
        return;
    }

    setLoading(button, true, 'Creating account...');

    try {
        const credential = await createUserWithEmailAndPassword(auth, data.email, data.password);

        try {
            await setDoc(doc(db, 'users', credential.user.uid), {
                firstName: data.firstName,
                lastName: data.lastName,
                email: data.email,
                phone: data.phone || null,
                role: 'user',
                status: 'active',
                createdAt: serverTimestamp(),
                lastLogin: null,
                createdBy: null
            });
        } catch (profileError) {
            await credential.user.delete().catch(() => {});
            throw profileError;
        }

        await logActivity('REGISTER', 'New user account created.', data.firstName + ' ' + data.lastName);
        await signOut(auth);

        location.replace('login.html?registered=1');
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            setFieldError(form, 'email', 'This email is already registered.');
        } else {
            showAlert(alertBox, 'error', friendlyError(error));
        }
        setLoading(button, false);
    }
});