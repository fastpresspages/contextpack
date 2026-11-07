// ContextPack Site App — Pure JS, Zero Dependencies
(function () {
  'use strict';

  // 1. Mobile Menu Toggle
  var menuBtn = document.querySelector('.menu-btn');
  var menu = document.getElementById('menu');
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', function () {
      var open = menu.hasAttribute('data-open');
      if (open) { menu.removeAttribute('data-open'); }
      else { menu.setAttribute('data-open', ''); }
      menuBtn.setAttribute('aria-expanded', String(!open));
      menuBtn.textContent = open ? 'Menu' : 'Close';
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.hasAttribute('data-open')) {
        menu.removeAttribute('data-open');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.textContent = 'Menu';
      }
    });

    document.addEventListener('click', function (e) {
      if (menu.hasAttribute('data-open') && !menu.contains(e.target) && !menuBtn.contains(e.target)) {
        menu.removeAttribute('data-open');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.textContent = 'Menu';
      }
    });
  }

  // 2. Clipboard Copy Button
  document.querySelectorAll('.copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetSel = btn.getAttribute('data-copy');
      var targetEl = document.querySelector(targetSel);
      if (!targetEl) return;
      var text = targetEl.textContent.trim();
      navigator.clipboard.writeText(text).then(function () {
        var original = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('btn-primary');
        setTimeout(function () {
          btn.textContent = original;
          btn.classList.remove('btn-primary');
        }, 2000);
      });
    });
  });

  // 3. In-Browser Calibrated Tokenizer Heuristic
  function estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    var base = Math.ceil(text.length / 3.85);
    var punctuation = (text.match(/[{}[\]()<>;:,.\-_+=|\\/]/g) || []).length;
    var newlines = (text.match(/\n/g) || []).length;
    var tokens = Math.round(base + (punctuation * 0.15) + (newlines * 0.25));
    return Math.max(tokens, 1);
  }

  // 4. Interactive Simulator Logic
  var packBtn = document.getElementById('sim-pack-btn');
  var codeArea = document.getElementById('sim-code');
  var outputArea = document.getElementById('sim-output');
  var statsBadge = document.getElementById('sim-stats');
  var formatSelect = document.getElementById('sim-format');
  var treeCheck = document.getElementById('sim-tree');
  var linesCheck = document.getElementById('sim-lines');

  function runSimulator() {
    if (!codeArea || !outputArea) return;
    var raw = codeArea.value;
    var fmt = formatSelect ? formatSelect.value : 'xml';
    var withTree = treeCheck ? treeCheck.checked : true;
    var withLines = linesCheck ? linesCheck.checked : true;

    var formattedCode = raw;
    if (withLines) {
      var lines = raw.split('\n');
      var maxDigits = String(lines.length).length;
      formattedCode = lines.map(function (line, idx) {
        var num = String(idx + 1).padStart(maxDigits, ' ');
        return num + ': ' + line;
      }).join('\n');
    }

    var treeText = withTree
      ? '├── src/\n│   └── math.js (1.4 KB)\n└── package.json (480 B)\n'
      : '';

    var output = '';
    if (fmt === 'xml') {
      output = '<documents>\n';
      if (withTree) {
        output += '<directory_tree>\n' + treeText + '</directory_tree>\n\n';
      }
      output += '<document index="1">\n' +
                '<source>src/math.js</source>\n' +
                '<document_content><![CDATA[\n' +
                formattedCode +
                '\n]]></document_content>\n' +
                '</document>\n' +
                '</documents>';
    } else if (fmt === 'markdown') {
      output = '# Codebase Context\n\n';
      if (withTree) {
        output += '## Directory Tree\n```\n' + treeText + '```\n\n';
      }
      output += '## Codebase Contents\n\n' +
                '### `src/math.js`\n```javascript\n' +
                formattedCode +
                '\n```\n';
    } else {
      // llms
      output = '# Codebase Context\n\n';
      if (withTree) {
        output += '## Structure\n```\n' + treeText + '```\n\n';
      }
      output += '## File: `src/math.js`\n```javascript\n' +
                formattedCode +
                '\n```\n';
    }

    outputArea.textContent = output;
    var tokens = estimateTokens(output);
    if (statsBadge) {
      statsBadge.textContent = tokens.toLocaleString() + ' tokens';
    }
  }

  if (packBtn) packBtn.addEventListener('click', runSimulator);
  if (formatSelect) formatSelect.addEventListener('change', runSimulator);
  if (treeCheck) treeCheck.addEventListener('change', runSimulator);
  if (linesCheck) linesCheck.addEventListener('change', runSimulator);

  // Initial trigger
  if (packBtn) runSimulator();

  // 5. FormSubmit AJAX Form Handling
  var form = document.querySelector('.lead-form');
  if (form) {
    var status = form.querySelector('.form-status');
    var submitBtn = form.querySelector('button[type="submit"]');

    function showStatus(msg, ok) {
      if (!status) return;
      status.textContent = msg;
      status.className = 'form-status ' + (ok ? 'ok' : 'err');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var honey = form.querySelector('input[name="_honey"]');
      if (honey && honey.value) return; // bot detection

      var email = String((form.querySelector('#f-email') || {}).value || '').trim();
      var msg = String((form.querySelector('#f-msg') || {}).value || '').trim();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showStatus('Please enter a valid email address.', false);
        return;
      }
      if (msg.length < 10) {
        showStatus('Please provide a bit more detail (at least 10 characters).', false);
        return;
      }

      var payload = {
        email: email,
        message: msg,
        request_type: 'ContextPack feedback',
        page: 'contextpack',
        date: new Date().toISOString(),
        _subject: '[ContextPack] Feedback or question',
        _template: 'table',
        _captcha: 'false'
      };

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending…';
      }
      showStatus('Sending message…', true);

      fetch('https://formsubmit.co/ajax/meetcode99@gmail.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, j: j }; });
      })
      .then(function (res) {
        if (res.ok && String(res.j.success) === 'true') {
          showStatus('Thank you! A human reads every inquiry within a day.', true);
          form.reset();
        } else {
          showStatus('Unable to send. Please open an issue on GitHub or email meetcode99@gmail.com directly.', false);
        }
      })
      .catch(function () {
        showStatus('Network error. Please email meetcode99@gmail.com directly.', false);
      })
      .finally(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Message';
        }
      });
    });
  }
})();
