document.addEventListener('DOMContentLoaded', function () {
  // Handle view mode switching
  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      let comparison = this.closest('.comparison');
      let mode = this.dataset.mode;

      // Update active button
      comparison
        .querySelectorAll('.view-mode-btn')
        .forEach(b => b.classList.remove('active'));
      this.classList.add('active');

      // Update viewer mode
      let viewer = comparison.querySelector('.comparison-viewer');
      viewer.dataset.mode = mode;

      // Hide all mode containers
      viewer.querySelectorAll('.mode-container').forEach(container => {
        container.style.display = 'none';
      });

      // Show appropriate mode container
      let activeContainer = viewer.querySelector('.' + mode + '-mode');
      if (activeContainer) {
        activeContainer.style.display = 'block';
      }
    });
  });

  // Handle onion skin drag-to-reveal
  document.querySelectorAll('.onion-container').forEach(container => {
    let isDragging = false;

    function updateOnionSkin(x) {
      let rect = container.getBoundingClientRect();
      let percentage = Math.max(
        0,
        Math.min(100, ((x - rect.left) / rect.width) * 100)
      );

      let currentImg = container.querySelector('.onion-current');
      let divider = container.querySelector('.onion-divider');

      if (currentImg && divider) {
        currentImg.style.clipPath = 'inset(0 ' + (100 - percentage) + '% 0 0)';
        divider.style.left = percentage + '%';
      }
    }

    container.addEventListener('mousedown', function (e) {
      isDragging = true;
      updateOnionSkin(e.clientX);
      e.preventDefault();
    });

    container.addEventListener('mousemove', function (e) {
      if (isDragging) {
        updateOnionSkin(e.clientX);
      }
    });

    document.addEventListener('mouseup', function () {
      isDragging = false;
    });

    // Touch events for mobile
    container.addEventListener('touchstart', function (e) {
      isDragging = true;
      updateOnionSkin(e.touches[0].clientX);
      e.preventDefault();
    });

    container.addEventListener('touchmove', function (e) {
      if (isDragging) {
        updateOnionSkin(e.touches[0].clientX);
        e.preventDefault();
      }
    });

    document.addEventListener('touchend', function () {
      isDragging = false;
    });
  });

  // Handle overlay mode clicking
  document.querySelectorAll('.overlay-container').forEach(container => {
    container.addEventListener('click', function () {
      let diffImage = this.querySelector('.diff-image');
      if (diffImage) {
        // Toggle diff visibility
        let isVisible = diffImage.style.opacity === '1';
        diffImage.style.opacity = isVisible ? '0' : '1';
      }
    });
  });

  // Handle toggle mode clicking
  document.querySelectorAll('.toggle-container img').forEach(img => {
    let isBaseline = true;
    let comparison = img.closest('.comparison');
    let baselineSrc = comparison.querySelector('.baseline-image').src;
    let currentSrc = comparison.querySelector('.current-image').src;

    img.addEventListener('click', function () {
      isBaseline = !isBaseline;
      this.src = isBaseline ? baselineSrc : currentSrc;

      // Update cursor style to indicate interactivity
      this.style.cursor = 'pointer';
    });
  });

  console.log('Vizzly TDD Report loaded successfully');
});
