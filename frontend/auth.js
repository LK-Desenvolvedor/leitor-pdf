const AUTH_URL = "http://localhost:5000/auth";
const API_BASE_URL = "http://localhost:5000/api";
const loginSection = document.getElementById('login-section');
const registerSection = document.getElementById('register-section');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const loginLoading = document.getElementById('login-loading');
const registerLoading = document.getElementById('register-loading');

function switchToRegister(event) {
    event.preventDefault();
    loginSection.classList.remove('active');
    registerSection.classList.add('active');
    clearErrors();
}

function switchToLogin(event) {
    event.preventDefault();
    registerSection.classList.remove('active');
    loginSection.classList.add('active');
    clearErrors();
}

function clearErrors() {
    loginError.style.display = 'none';
    registerError.style.display = 'none';
    loginError.textContent = '';
    registerError.textContent = '';
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePassword(password) {
    return password && password.length >= 6;
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    clearErrors();

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) {
        showLoginError('Preencha todos os campos');
        return;
    }

    if (!validateEmail(email)) {
        showLoginError('E-mail inválido');
        return;
    }

    loginLoading.style.display = 'block';
    const loginBtn = loginForm.querySelector('button[type="submit"]');
    loginBtn.disabled = true;

    try {
        const response = await fetch(`${AUTH_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok && data.token) {
            localStorage.setItem('pdf_reader_token', data.token);
            localStorage.setItem('pdf_reader_user', JSON.stringify({
                name: email.split('@')[0],
                email: email
            }));
            window.location.href = 'reader.html';
        } else {
            showLoginError(data.msg || 'Falha no login. Verifique suas credenciais.');
        }
    } catch (error) {
        console.error('Erro ao fazer login:', error);
        showLoginError('Erro de conexão com o servidor. Verifique se o backend está rodando em http://localhost:5000');
    } finally {
        loginLoading.style.display = 'none';
        loginBtn.disabled = false;
    }
}

function showLoginError(message) {
    loginError.textContent = message;
    loginError.style.display = 'block';
}

async function handleRegisterSubmit(event) {
    event.preventDefault();
    clearErrors();

    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;

    if (!name || !email || !password || !passwordConfirm) {
        showRegisterError('Preencha todos os campos');
        return;
    }

    if (name.length < 3) {
        showRegisterError('Nome deve ter pelo menos 3 caracteres');
        return;
    }

    if (!validateEmail(email)) {
        showRegisterError('E-mail inválido');
        return;
    }

    if (!validatePassword(password)) {
        showRegisterError('Senha deve ter pelo menos 6 caracteres');
        return;
    }

    if (password !== passwordConfirm) {
        showRegisterError('As senhas não conferem');
        return;
    }

    registerLoading.style.display = 'block';
    const registerBtn = registerForm.querySelector('button[type="submit"]');
    registerBtn.disabled = true;

    try {
        const response = await fetch(`${AUTH_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });

        const data = await response.json();

        if (response.ok) {
            alert('Conta criada com sucesso! Agora faça login.');
            document.getElementById('register-email').value = email;
            document.getElementById('register-password').value = '';
            document.getElementById('register-password-confirm').value = '';
            document.getElementById('register-name').value = '';
            switchToLogin({ preventDefault: () => {} });
        } else {
            showRegisterError(data.msg || 'Erro ao criar conta. Tente novamente.');
        }
    } catch (error) {
        console.error('Erro ao registrar:', error);
        showRegisterError('Erro de conexão com o servidor. Verifique se o backend está rodando em http://localhost:5000');
    } finally {
        registerLoading.style.display = 'none';
        registerBtn.disabled = false;
    }
}

function showRegisterError(message) {
    registerError.textContent = message;
    registerError.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('pdf_reader_token');
    if (token) {
        window.location.href = 'reader.html';
    }
});
