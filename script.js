document.querySelectorAll('.toggle-pass').forEach(function (button) {
    button.addEventListener('click', function () {
        var input = document.getElementById(button.dataset.target);
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.classList.toggle('is-visible', show);
        button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        input.focus();
    });
});

document.querySelectorAll('[data-strength-for]').forEach(function (meter) {
    var input = document.getElementById(meter.dataset.strengthFor);
    var label = meter.querySelector('.strength-label');
    var names = ['8+ characters', 'Weak', 'Fair', 'Good', 'Strong'];

    input.addEventListener('input', function () {
        var value = input.value;
        var score = 0;

        if (value.length > 0) {
            if (value.length >= 8) score++;
            if (/[A-Za-z]/.test(value) && /\d/.test(value)) score++;
            if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
            if (/[^A-Za-z0-9]/.test(value) || value.length >= 12) score++;
            if (score === 0) score = 1;
        }

        meter.dataset.level = score;
        label.textContent = names[score];
    });
});

document.querySelectorAll('form[data-loading]').forEach(function (form) {
    form.addEventListener('submit', function () {
        var button = form.querySelector('button[type="submit"]');
        var text = button.querySelector('.btn-text');
        button.disabled = true;
        if (text) {
            text.textContent = form.dataset.loadingText || 'Please wait...';
        }
    });
});