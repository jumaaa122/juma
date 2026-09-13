(function(){
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- Preloader ---------------- */
  window.addEventListener("load", function(){
    var pre = document.getElementById("preloader");
    setTimeout(function(){ pre && pre.classList.add("is-done"); }, reduceMotion ? 0 : 900);
  });

  /* ---------------- Footer year ---------------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------- Theme toggle ---------------- */
  var THEME_KEY = "gj-theme";
  var body = document.body;
  var themeToggle = document.getElementById("themeToggle");
  var savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch(e){}
  if (savedTheme) body.setAttribute("data-theme", savedTheme);

  themeToggle && themeToggle.addEventListener("click", function(){
    var current = body.getAttribute("data-theme") === "ivory" ? "ivory" : "dusk";
    var next = current === "ivory" ? "dusk" : "ivory";
    body.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch(e){}
  });

  /* ---------------- Mobile nav ---------------- */
  var navToggle = document.getElementById("navToggle");
  var nav = document.getElementById("nav");
  navToggle && navToggle.addEventListener("click", function(){
    var open = nav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  nav && nav.querySelectorAll(".nav__link").forEach(function(link){
    link.addEventListener("click", function(){
      nav.classList.remove("is-open");
      navToggle && navToggle.setAttribute("aria-expanded", "false");
    });
  });

  /* ---------------- Header scroll state + progress bar ---------------- */
  var header = document.getElementById("siteHeader");
  var progressBar = document.getElementById("progressBar");
  var spineFill = document.getElementById("spineFill");
  var timelineEl = document.getElementById("timeline");

  function onScroll(){
    var scrollY = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle("is-scrolled", scrollY > 30);

    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - doc.clientHeight;
    var pct = scrollable > 0 ? (scrollY / scrollable) * 100 : 0;
    if (progressBar) progressBar.style.width = pct + "%";

    if (timelineEl && spineFill) {
      var rect = timelineEl.getBoundingClientRect();
      var vh = window.innerHeight;
      var total = rect.height;
      var visible = vh * 0.55 - rect.top;
      var fillPct = Math.max(0, Math.min(1, visible / total));
      spineFill.style.height = (fillPct * 100) + "%";
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------------- Custom cursor ---------------- */
  var cursor = document.getElementById("cursor");
  if (cursor && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    var cx = 0, cy = 0, rx = 0, ry = 0;
    window.addEventListener("mousemove", function(e){
      cx = e.clientX; cy = e.clientY;
      cursor.querySelector(".cursor__dot").style.transform = "translate(" + cx + "px," + cy + "px)";
    });
    (function raf(){
      rx += (cx - rx) * 0.18;
      ry += (cy - ry) * 0.18;
      cursor.querySelector(".cursor__ring").style.transform = "translate(" + rx + "px," + ry + "px)";
      requestAnimationFrame(raf);
    })();
    document.querySelectorAll("[data-cursor='link'], a, button, .tl-item__card, .ex-card").forEach(function(el){
      el.addEventListener("mouseenter", function(){ cursor.classList.add("is-active"); });
      el.addEventListener("mouseleave", function(){ cursor.classList.remove("is-active"); });
    });
  } else if (cursor) {
    cursor.style.display = "none";
  }

  /* ---------------- Reveal on scroll ---------------- */
  var revealEls = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function(el){ io.observe(el); });
  } else {
    revealEls.forEach(function(el){ el.classList.add("is-visible"); });
  }

  /* ---------------- Counters ---------------- */
  function animateCounter(el){
    var target = parseFloat(el.getAttribute("data-count"));
    var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
    var prefix = el.getAttribute("data-prefix") || "";
    var suffix = el.getAttribute("data-suffix") || "";
    var dur = 1800;
    var startTime = null;

    function step(ts){
      if (!startTime) startTime = ts;
      var progress = Math.min((ts - startTime) / dur, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var value = target * eased;
      el.textContent = prefix + value.toFixed(decimals) + suffix;
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = prefix + target.toFixed(decimals) + suffix;
    }
    requestAnimationFrame(step);
  }

  var counters = document.querySelectorAll("[data-count]");
  if ("IntersectionObserver" in window) {
    var cIo = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          cIo.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    counters.forEach(function(el){ cIo.observe(el); });
  } else {
    counters.forEach(function(el){
      var target = parseFloat(el.getAttribute("data-count"));
      var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
      el.textContent = (el.getAttribute("data-prefix")||"") + target.toFixed(decimals) + (el.getAttribute("data-suffix")||"");
    });
  }

  /* ---------------- Typewriter roles ---------------- */
  var roles = [
    "Director, First 23rd Group (Pty) Ltd",
    "Senior Insurance & Risk Advisory Executive",
    "30+ Years Across Africa's Insurance Markets",
    "Public Sector & Municipal Risk Strategist"
  ];
  var twEl = document.getElementById("typewriter");
  if (twEl) {
    if (reduceMotion) {
      twEl.textContent = roles[0];
    } else {
      var roleIndex = 0, charIndex = 0, deleting = false;

      function tick(){
        var current = roles[roleIndex];
        if (!deleting) {
          charIndex++;
          twEl.textContent = current.slice(0, charIndex);
          if (charIndex === current.length) {
            deleting = true;
            setTimeout(tick, 1800);
            return;
          }
        } else {
          charIndex--;
          twEl.textContent = current.slice(0, charIndex);
          if (charIndex === 0) {
            deleting = false;
            roleIndex = (roleIndex + 1) % roles.length;
          }
        }
        setTimeout(tick, deleting ? 28 : 46);
      }
      tick();
    }
  }

  /* ---------------- Hero particle network ---------------- */
  var canvas = document.getElementById("heroCanvas");
  if (canvas && !reduceMotion) {
    var ctx = canvas.getContext("2d");
    var particles = [];
    var w, h, dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize(){
      w = canvas.parentElement.offsetWidth;
      h = canvas.parentElement.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var count = Math.max(28, Math.min(70, Math.floor((w * h) / 24000)));
      particles = [];
      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          r: Math.random() * 1.4 + 0.6
        });
      }
    }

    function draw(){
      ctx.clearRect(0, 0, w, h);
      var maxDist = Math.min(160, w / 6);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(201,162,74,0.55)";
        ctx.fill();

        for (var j = i + 1; j < particles.length; j++) {
          var q = particles[j];
          var dx = p.x - q.x, dy = p.y - q.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxDist) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = "rgba(201,162,74," + (0.16 * (1 - dist / maxDist)) + ")";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener("resize", resize);
  }

  /* ---------------- Marquee seamless duplicate ---------------- */
  var marqueeTrack = document.getElementById("marqueeTrack");
  if (marqueeTrack) {
    marqueeTrack.innerHTML += marqueeTrack.innerHTML;
  }

  /* ---------------- Contact form (mailto) ---------------- */
  var form = document.getElementById("contactForm");
  var formNote = document.getElementById("formNote");
  if (form) {
    form.addEventListener("submit", function(e){
      e.preventDefault();
      var name = form.name.value.trim();
      var email = form.email.value.trim();
      var org = form.org.value.trim();
      var message = form.message.value.trim();

      var subject = encodeURIComponent("Advisory Inquiry — " + name);
      var bodyLines = [
        "Name: " + name,
        "Email: " + email,
        org ? "Organisation: " + org : "",
        "",
        message
      ].filter(Boolean);
      var body = encodeURIComponent(bodyLines.join("\n"));

      window.location.href = "mailto:g.juma@1st23rdgroup.com?subject=" + subject + "&body=" + body;
      if (formNote) {
        formNote.textContent = "Opening your email client to send this inquiry to Gerald…";
      }
    });
  }

})();
