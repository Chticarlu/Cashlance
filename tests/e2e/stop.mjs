// Explicit close avoids Windows process-tree termination hanging on Next workers.
export default async function teardown(){await fetch('http://127.0.0.1:54440/shutdown',{method:'POST'}).catch(()=>{})}
