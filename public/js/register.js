document.getElementById("register-form").addEventListener("submit", async function (event) {
    event.preventDefault(); // Prevents the form from redirecting to /api/register

    const formData = {
        fname: document.getElementById("fname").value,
        lname: document.getElementById("lname").value,
        username: document.getElementById("username").value,
        password: document.getElementById("password").value,
    };

    try {
        const response = await fetch("http://localhost:3000/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData),
        });

        const data = await response.json();
        document.getElementById("response-message").textContent = data.message || data.error;

        if (response.ok) {
            // ✅ Redirect to homepage after successful registration
            window.location.href = "index.html"; // Redirect to index.html
        }
    } catch (error) {
        console.error("Error:", error);
    }
});
