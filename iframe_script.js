// iframe_script.js
window.addEventListener('message', (event) => {
  if (event.origin === 'https://www.chatcity.de') {
    const message = event.data;
    switch (message.type) {
      case 'changeBackgroundColor':
        document.body.style.backgroundColor = message.color;
        break;
      case 'setSuperwhisper':
        // ... (logic to update the superwhisper status in the iframe, you'll need to implement this based on how the iframe's chat works)
        break;
      case 'printInChat':
        // ... (logic to display messages within the chat log, you'll need to implement this based on how the iframe's chat works)
        break;
      // ... (add more cases for other messages)
    }
  }
});
