const navToggle = document.getElementById("navToggle");
const navMobile = document.getElementById("navMobile");

navToggle.addEventListener("click", () => {
  navMobile.classList.toggle("open");
});

navMobile.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => navMobile.classList.remove("open"));
});
