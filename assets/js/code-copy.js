// Code Copy Button Functionality
(function() {
  'use strict';

  function addCopyButtons() {
    const codeBlocks = document.querySelectorAll('div.highlighter-rouge');

    codeBlocks.forEach(function(block) {
      // Skip if already has button
      if (block.querySelector('.copy-button')) return;

      // Create button
      const button = document.createElement('button');
      button.className = 'copy-button';
      button.textContent = 'Copy';
      button.setAttribute('aria-label', 'Copy code to clipboard');

      // Add click handler
      button.addEventListener('click', function() {
        const code = block.querySelector('code');
        const text = code ? code.textContent : '';

        navigator.clipboard.writeText(text).then(function() {
          button.textContent = 'Copied!';
          button.classList.add('copied');

          setTimeout(function() {
            button.textContent = 'Copy';
            button.classList.remove('copied');
          }, 2000);
        }).catch(function(err) {
          console.error('Failed to copy:', err);
          button.textContent = 'Failed';

          setTimeout(function() {
            button.textContent = 'Copy';
          }, 2000);
        });
      });

      // Make block relative for positioning
      block.style.position = 'relative';
      block.appendChild(button);
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addCopyButtons);
  } else {
    addCopyButtons();
  }
})();
