const fs = require('fs');

const content = fs.readFileSync('index.html', 'utf-8');

// Find view-renderer
const rendererStart = content.indexOf('<!-- ================= DOCUMENT RENDERER VIEW ================= -->');
// Find view-debate
const debateStart = content.indexOf('<!-- ================= DEBATE VIEW (Sue Your Brain interactive) ================= -->');
// Find end of view-debate (the end of its container div before the closing of app-container)
const debateEnd = content.indexOf('    </div>\n\n    <!-- Docket / Case History -->');

if (rendererStart > -1 && debateStart > -1 && debateEnd > -1) {
  const rendererContent = content.substring(rendererStart, debateStart);
  const debateContent = content.substring(debateStart, debateEnd);
  
  const newContent = content.substring(0, rendererStart) + 
                     debateContent + 
                     rendererContent + 
                     content.substring(debateEnd);
                     
  fs.writeFileSync('index.html', newContent);
  console.log("Successfully swapped view-debate and view-renderer");
} else {
  console.log("Could not find blocks");
}
