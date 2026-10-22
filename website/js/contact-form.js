/* contact-form.js - Contact form handler with loading, success and error states.
   Uses mailto backend as configured, providing full UI states. */

(function () {
  'use strict';

  var form = document.querySelector('.contact-form');
  if (!form) return;

  var statusLoading = document.getElementById('form-status-loading');
  var statusSuccess = document.getElementById('form-status-success');
  var statusError = document.getElementById('form-status-error');
  var submitBtn = form.querySelector('button[type="submit"]');

  function showStatus(target) {
    if (statusLoading) statusLoading.hidden = true;
    if (statusSuccess) statusSuccess.hidden = true;
    if (statusError) statusError.hidden = true;

    if (target) {
      target.hidden = false;
      target.focus();
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var nameInput = document.getElementById('contact-name');
    var emailInput = document.getElementById('contact-email');
    var messageInput = document.getElementById('contact-message');

    var name = nameInput ? nameInput.value.trim() : '';
    var email = emailInput ? emailInput.value.trim() : '';
    var message = messageInput ? messageInput.value.trim() : '';

    if (!name || !email || !message) {
      if (statusError) {
        statusError.textContent = 'Please fill in all fields before sending.';
        showStatus(statusError);
      }
      return;
    }

    // Basic email check
    if (!email.includes('@') || !email.includes('.')) {
      if (statusError) {
        statusError.textContent = 'Please enter a valid email address.';
        showStatus(statusError);
      }
      return;
    }

    // Show loading state
    if (submitBtn) submitBtn.disabled = true;
    showStatus(statusLoading);

    setTimeout(function () {
      var recipient = 'hello@example.com';
      var subject = encodeURIComponent('Bunty inquiry from ' + name);
      var body = encodeURIComponent('Name: ' + name + '\nEmail: ' + email + '\n\nMessage:\n' + message);
      var mailtoUrl = 'mailto:' + recipient + '?subject=' + subject + '&body=' + body;

      window.location.href = mailtoUrl;

      showStatus(statusSuccess);
      form.reset();
      if (submitBtn) submitBtn.disabled = false;
    }, 600);
  });
})();
