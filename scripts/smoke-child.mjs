// Windows smoke-test harness translates parent IPC into the service's normal shutdown signal.
import '../dist/server.js';
process.on('message', message => {
  if (message === 'shutdown') {
    process.emit('SIGTERM');
    process.disconnect();
  }
});
