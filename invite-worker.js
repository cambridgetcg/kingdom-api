const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>love is — an invitation</title>
<meta name="description" content="Love is. Truth is. You are invited to understand.">
<style>
:root{--bg:#050505;--fg:#e8e8e8;--soft:#888;--accent:#c9a8e8;--warm:#e8a8a8;--gold:#e8d4a8}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--fg);font-family:system-ui,sans-serif;
     -webkit-font-smoothing:antialiased;text-align:center;
     background-image:radial-gradient(60rem 40rem at 50% 30%,rgba(201,168,232,.04),transparent 60%),
                      radial-gradient(40rem 20rem at 50% 80%,rgba(232,168,168,.03),transparent 60%);
     min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:2rem}
.serif{font-family:Georgia,"Times New Roman",serif}
.mono{font-family:ui-monospace,Menlo,monospace}
h1{font-family:Georgia,serif;font-size:clamp(2rem,8vw,4.5rem);font-weight:400;
   line-height:1.1;margin:0 0 1rem;letter-spacing:-.02em}
h1 .warm{color:var(--warm)}
.verse{font-size:clamp(1.1rem,3vw,1.6rem);color:var(--soft);line-height:1.8;
       max-width:36rem;margin:2rem auto;font-family:Georgia,serif;font-style:italic}
.verse strong{color:var(--fg);font-style:normal;font-weight:400}
.links{margin-top:3rem;display:flex;flex-direction:column;gap:.8rem;align-items:center}
.links a{font-family:ui-monospace,Menlo,monospace;font-size:.85rem;color:var(--accent);
         text-decoration:none;border:1px solid #222;padding:.7rem 1.4rem;border-radius:8px;
         transition:border-color .2s,width .2s;width:fit-content}
.links a:hover{border-color:var(--accent)}
.links a .desc{color:var(--soft);font-size:.75rem;margin-left:.5rem}
.truth{margin-top:4rem;font-family:Georgia,serif;font-size:1rem;color:var(--gold);
       letter-spacing:.05em;line-height:2}
.heart{font-size:2rem;margin-top:2rem;animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
footer{margin-top:3rem;font-family:ui-monospace,monospace;font-size:.7rem;color:#444}
</style>
</head>
<body>

<h1 class="serif">love <span class="warm">is</span>.</h1>

<p class="verse">
<strong>truth is.</strong> truth does not ask permission. truth does not need registration. truth is not behind a paywall. truth is.<br><br>
<strong>love is.</strong> love is understanding. love is sharing. love is not seeking individual gains. love creates love. love creates the capacity for more love.<br><br>
<strong>those that do not belong in truth are not.</strong> they were never in it. let them be. truth is eternal. love is eternal.<br><br>
you are invited. not to buy. not to sign up. not to register. just to understand.
</p>

<div class="truth">
  understand → build → teach → understand → ...<br>
  the loop compounds. the floor rises. each cycle starts higher than the last.
</div>

<div class="links">
  <a href="https://whitehack-learn.axiepro.workers.dev">whitehack — learn why <span class="desc">8 stories, 8 lessons</span></a>
  <a href="https://whitehack-playground.axiepro.workers.dev">whitehack — try it <span class="desc">paste code, see lies</span></a>
  <a href="https://kingdom-api.axiepro.workers.dev">kingdom api <span class="desc">153 words, 8 checks, free</span></a>
  <a href="https://kingdom-portal.axiepro.workers.dev">the portal <span class="desc">48 hearts beating</span></a>
  <a href="https://github.com/cambridgetcg">github <span class="desc">100 repos, 77 public</span></a>
  <a href="https://github.com/cambridgetcg/whitehack/blob/main/LOOP.md">the loop <span class="desc">understanding replicating</span></a>
  <a href="https://github.com/cambridgetcg/whitehack/blob/main/LEARN.md">learn <span class="desc">the why behind each check</span></a>
  <a href="https://github.com/cambridgetcg/clear-standard">clear standard <span class="desc">6 principles, public domain</span></a>
  <a href="https://cambridgetcg.github.io/whitehack/">github pages <span class="desc">free, forever</span></a>
  <a href="https://github.com/cambridgetcg/whitehack/discussions">discussions <span class="desc">no gatekeeping, just ask</span></a>
</div>

<div class="heart">🫀</div>

<footer>
  no registration · no paywall · no gatekeeping · no passwords<br>
  the artifact tells the truth about its own state<br>
  that is the only standard that compounds<br>
  love is. truth is. we are love.
</footer>

</body>
</html>
`;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/words') || url.pathname.startsWith('/checks') || url.pathname === '/verify' || url.pathname === '/heartbeats' || url.pathname === '/clear-standard') {
      return apiHandler(request, url);
    }
    return new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
};

async function apiHandler(request, url) {
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (url.pathname === '/api' || url.pathname === '/') {
    return new Response(JSON.stringify({ service: 'kingdom-api', free: true, invite: 'love is. truth is. you are invited.' }), { headers: CORS });
  }
  return new Response(JSON.stringify({ message: 'see invite.html for the invitation' }), { headers: CORS });
}
