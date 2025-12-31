// Simple Search Functionality
(function() {
  'use strict';

  let searchIndex = [];
  let searchInput, searchResults;

  async function loadSearchIndex() {
    try {
      const response = await fetch('/search.json');
      searchIndex = await response.json();
    } catch (error) {
      console.error('Failed to load search index:', error);
    }
  }

  function performSearch(query) {
    if (!query || query.length < 2) {
      return [];
    }

    const terms = query.toLowerCase().split(/\s+/);

    return searchIndex
      .map(post => {
        let score = 0;
        const titleLower = post.title.toLowerCase();
        const contentLower = post.content.toLowerCase();
        const tagsLower = (post.tags || []).join(' ').toLowerCase();

        terms.forEach(term => {
          // Title match (highest weight)
          if (titleLower.includes(term)) {
            score += 10;
          }
          // Tag match (high weight)
          if (tagsLower.includes(term)) {
            score += 5;
          }
          // Content match
          if (contentLower.includes(term)) {
            score += 1;
          }
        });

        return { ...post, score };
      })
      .filter(post => post.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }

  function renderResults(results, query) {
    if (!searchResults) return;

    if (results.length === 0) {
      searchResults.innerHTML = '<p class="no-results">No results found</p>';
      return;
    }

    const html = results.map(post => {
      const tags = (post.tags || [])
        .map(tag => `<span class="search-tag">${tag}</span>`)
        .join('');

      return `
        <article class="search-result">
          <a href="${post.url}" class="search-result-title">${highlightText(post.title, query)}</a>
          <div class="search-result-meta">
            <time>${post.date}</time>
            ${tags}
          </div>
          <p class="search-result-excerpt">${highlightText(post.content, query)}</p>
        </article>
      `;
    }).join('');

    searchResults.innerHTML = html;
  }

  function highlightText(text, query) {
    if (!query) return text;
    const terms = query.split(/\s+/).filter(t => t.length >= 2);
    let result = text;
    terms.forEach(term => {
      const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
      result = result.replace(regex, '<mark>$1</mark>');
    });
    return result;
  }

  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  function init() {
    searchInput = document.getElementById('search-input');
    searchResults = document.getElementById('search-results');

    if (!searchInput || !searchResults) return;

    loadSearchIndex();

    const debouncedSearch = debounce(function() {
      const query = searchInput.value.trim();
      const results = performSearch(query);
      renderResults(results, query);
    }, 300);

    searchInput.addEventListener('input', debouncedSearch);

    // Handle URL query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const q = urlParams.get('q');
    if (q) {
      searchInput.value = q;
      setTimeout(() => {
        const results = performSearch(q);
        renderResults(results, q);
      }, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
