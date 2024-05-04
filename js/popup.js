let button1 = document.getElementById('button1')
button1.addEventListener("click",  () => {
    alert("Button 1")
});

let button2 = document.getElementById('button2')
button2.addEventListener("click", () => {
    alert("Button 2")
});

let button3 = document.getElementById('button3')
button3.addEventListener("click", () => {
    alert("Button 3")
});

let button4 = document.getElementById('button4')
button4.addEventListener("click", () => {
    alert("Button 4")
});

let button5 = document.getElementById('button5')
button5.addEventListener("click", async () => {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['js//old_bot.js'],
    });
});