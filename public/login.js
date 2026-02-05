const form = document.getElementById("loginForm");
const errorEl = document.getElementById("loginError");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      errorEl.textContent = "Usuario o contraseña incorrectos.";
      return;
    }

    window.location.href = "/";
  } catch (error) {
    console.error(error);
    errorEl.textContent = "No se pudo iniciar sesión.";
  }
});
