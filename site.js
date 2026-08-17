/* Deca Property Group - shared behaviour: active nav, mobile menu, scroll reveal */
(function () {
  var page = location.pathname.split('/').pop() || 'index.html';
  if (page === '') page = 'index.html';

  document.querySelectorAll('.nav-links a').forEach(function (a) {
    var href = a.getAttribute('href');
    if (href === page) a.classList.add('active');
    if (a.dataset.match && page.indexOf(a.dataset.match) === 0) a.classList.add('active');
  });

  var burger = document.querySelector('.hamburger');
  var links = document.querySelector('.nav-links');
  if (burger && links) {
    burger.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        links.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  var targets = document.querySelectorAll('.rv');
  if (!('IntersectionObserver' in window)) {
    targets.forEach(function (el) { el.classList.add('on'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  targets.forEach(function (el) { io.observe(el); });
})();
