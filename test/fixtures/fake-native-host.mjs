import { encodeMessage, createDecoder } from '../../native/protocol.mjs';
const mode = process.argv[2];
if (mode === 'exit') { console.error('fixture: launcher could not read host'); process.exit(7); }
if (mode === 'quiet') process.exit(0);
if (mode === 'timeout') setInterval(() => {}, 1000);
else process.stdin.on('data', createDecoder(message => {
  setTimeout(() => process.stdout.write(encodeMessage({id:message.id,ok:true,result:{loggedIn:true,message:'fixture connected'}})), 20);
}));
