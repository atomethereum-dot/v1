(() => {
  const layer = document.getElementById("heroWaveParticles");
  if (!layer) return;

  const COUNT = 46;
  let html = "";
  for (let i = 0; i < COUNT; i++) {
    const x = Math.random() * 100;
    const y = 15 + Math.random() * 70;
    const size = Math.random() < 0.2 ? 2 : 1;
    const duration = (4.5 + Math.random() * 5).toFixed(2);
    const delay = (-Math.random() * 8).toFixed(2);
    html += `<span style="left:${x}%;top:${y}%;width:${size}px;height:${size}px;animation-duration:${duration}s;animation-delay:${delay}s"></span>`;
  }
  layer.innerHTML = html;
})();
