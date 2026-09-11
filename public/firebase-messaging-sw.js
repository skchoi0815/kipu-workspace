importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  "apiKey": "AIzaSyBKwvVmRXkZ51uChx1PmlVvnDN4Xff0W6U",
  "authDomain": "kipu-kangwon-14689.firebaseapp.com",
  "projectId": "kipu-kangwon-14689",
  "messagingSenderId": "878311387638",
  "appId": "1:878311387638:web:547cdd35089aad947817d7"
});

const messaging = firebase.messaging();

// 설치 가능 판정용 no-op fetch 핸들러 (응답에 개입하지 않음)
self.addEventListener('fetch', () => {});

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || '강원대분회';
  const options = {
    body: (payload.notification && payload.notification.body) || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  };
  self.registration.showNotification(title, options);
});
