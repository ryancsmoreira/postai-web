const http = require('http');

console.log('Fetching http://192.168.15.4:3000/v/8DO3L6 ...');

http.get('http://192.168.15.4:3000/v/8DO3L6', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Page loaded. Parsing scripts...');
    
    // Procura por tags script
    const scriptRegex = /<script[^>]*src="([^"]*)"/g;
    let match;
    let scripts = [];
    while ((match = scriptRegex.exec(data)) !== null) {
      scripts.push(match[1]);
    }

    console.log('\n--- Script Tags Found ---');
    scripts.forEach(s => console.log(s));

    // Procura por links de CSS ou preloads
    const linkRegex = /<link[^>]*href="([^"]*)"/g;
    let links = [];
    while ((match = linkRegex.exec(data)) !== null) {
      links.push(match[1]);
    }

    console.log('\n--- Link Tags Found ---');
    links.forEach(l => console.log(l));

    process.exit(0);
  });
}).on('error', (err) => {
  console.error('Error fetching page:', err.message);
  process.exit(1);
});
