document.addEventListener('DOMContentLoaded', () => {
  // Handle view mode switching
  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const comparison = this.closest('.comparison');
      const mode = this.dataset.mode;

      // Update active button
      for (let b of comparison.querySelectorAll('.view-mode-btn')) {
        b.classList.remove('active');
      }
      this.classList.add('active');

      // Update viewer mode
      const viewer = comparison.querySelector('.comparison-viewer');
      viewer.dataset.mode = mode;

      // Hide all mode containers
      viewer.querySelectorAll('.mode-container').forEach(container => {
        container.style.display = 'none';
      });

      // Show appropriate mode container
      const activeContainer = viewer.querySelector(`.${mode}-mode`);
      if (activeContainer) {
        activeContainer.style.display = 'block';
      }
    });
  });

  // Handle onion skin drag-to-reveal
  document.querySelectorAll('.onion-container').forEach(container => {
    let isDragging = false;

    function updateOnionSkin(x) {
      const rect = container.getBoundingClientRect();
      const percentage = Math.max(
        0,
        Math.min(100, ((x - rect.left) / rect.width) * 100)
      );

      const currentImg = container.querySelector('.onion-current');
      const divider = container.querySelector('.onion-divider');

      if (currentImg && divider) {
        currentImg.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
        divider.style.left = `${percentage}%`;
      }
    }

    container.addEventListener('mousedown', e => {
      isDragging = true;
      updateOnionSkin(e.clientX);
      e.preventDefault();
    });

    container.addEventListener('mousemove', e => {
      if (isDragging) {
        updateOnionSkin(e.clientX);
      }
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Touch events for mobile
    container.addEventListener('touchstart', e => {
      isDragging = true;
      updateOnionSkin(e.touches[0].clientX);
      e.preventDefault();
    });

    container.addEventListener('touchmove', e => {
      if (isDragging) {
        updateOnionSkin(e.touches[0].clientX);
        e.preventDefault();
      }
    });

    document.addEventListener('touchend', () => {
      isDragging = false;
    });
  });

  // Handle overlay mode clicking
  document.querySelectorAll('.overlay-container').forEach(container => {
    container.addEventListener('click', function () {
      const diffImage = this.querySelector('.diff-image');
      if (diffImage) {
        // Toggle diff visibility
        const isVisible = diffImage.style.opacity === '1';
        diffImage.style.opacity = isVisible ? '0' : '1';
      }
    });
  });

  // Handle toggle mode clicking
  document.querySelectorAll('.toggle-container img').forEach(img => {
    let isBaseline = true;
    const comparison = img.closest('.comparison');
    const baselineSrc = comparison.querySelector('.baseline-image').src;
    const currentSrc = comparison.querySelector('.current-image').src;

    img.addEventListener('click', function () {
      isBaseline = !isBaseline;
      this.src = isBaseline ? baselineSrc : currentSrc;

      // Update cursor style to indicate interactivity
      this.style.cursor = 'pointer';
    });
  });

  console.log('Vizzly TDD Report loaded successfully');
});
