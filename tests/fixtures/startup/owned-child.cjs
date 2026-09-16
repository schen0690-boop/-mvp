const timer=setInterval(()=>{},1000);
process.send?.('ready');
process.on('message',m=>{if(m==='shutdown'){clearInterval(timer);process.disconnect?.();}});
