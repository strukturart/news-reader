!function(){function e(e,t,n,r,a,o,s){try{var c=e[o](s),i=c.value}catch(e){n(e);return}c.done?t(i):Promise.resolve(i).then(r,a)}"function"==typeof SuppressedError&&SuppressedError;var t,n,r=new BroadcastChannel("sw-messages");r.addEventListener("message",function(e){r.postMessage({test:e.data.test})}),self.addEventListener("systemmessage",(t=function(e){var t,n;return function(e,t){var n,r,a,o={label:0,sent:function(){if(1&a[0])throw a[1];return a[1]},trys:[],ops:[]},s=Object.create(("function"==typeof Iterator?Iterator:Object).prototype);return s.next=c(0),s.throw=c(1),s.return=c(2),"function"==typeof Symbol&&(s[Symbol.iterator]=function(){return this}),s;function c(c){return function(i){return function(c){if(n)throw TypeError("Generator is already executing.");for(;s&&(s=0,c[0]&&(o=0)),o;)try{if(n=1,r&&(a=2&c[0]?r.return:c[0]?r.throw||((a=r.return)&&a.call(r),0):r.next)&&!(a=a.call(r,c[1])).done)return a;switch(r=0,a&&(c=[2&c[0],a.value]),c[0]){case 0:case 1:a=c;break;case 4:return o.label++,{value:c[1],done:!1};case 5:o.label++,r=c[1],c=[0];continue;case 7:c=o.ops.pop(),o.trys.pop();continue;default:if(!(a=(a=o.trys).length>0&&a[a.length-1])&&(6===c[0]||2===c[0])){o=0;continue}if(3===c[0]&&(!a||c[1]>a[0]&&c[1]<a[3])){o.label=c[1];break}if(6===c[0]&&o.label<a[1]){o.label=a[1],a=c;break}if(a&&o.label<a[2]){o.label=a[2],o.ops.push(c);break}a[2]&&o.ops.pop(),o.trys.pop();continue}c=t.call(e,o)}catch(e){c=[6,e],r=0}finally{n=a=0}if(5&c[0])throw c[1];return{value:c[0]?c[1]:void 0,done:!0}}([c,i])}}}(this,function(a){if("activity"===e.name)try{(n=e.data.webActivityRequestHandler().source).name,t=n.data,"feedolin"===t.name&&r.postMessage({oauth_success:t.data})}catch(e){console.error("Error handling system message:",e)}return[2]})},n=function(){var n=this,r=arguments;return new Promise(function(a,o){var s=t.apply(n,r);function c(t){e(s,a,o,c,i,"next",t)}function i(t){e(s,a,o,c,i,"throw",t)}c(void 0)})},function(e){return n.apply(this,arguments)}));var a=navigator.userAgent||"";if(a&&!a.includes("KAIOS")){var o="pwa-cache-v0.1161";self.addEventListener("install",function(e){e.waitUntil(caches.open(o).then(function(e){return console.log("Opened cache"),fetch("/file-list.json").then(function(e){if(!e.ok)throw Error("HTTP error! Status: ".concat(e.status));return e.json()}).then(function(t){if(Array.isArray(t))return Promise.all(t.map(function(t){return e.add(t).catch(function(e){console.error("Failed to cache ".concat(t,":"),e)})}));console.error("Fetched data is not an array:",t)})}).then(function(){return self.skipWaiting()}))}),self.addEventListener("activate",function(e){var t=[o];e.waitUntil(caches.keys().then(function(e){return Promise.all(e.map(function(e){if(!t.includes(e))return caches.delete(e)}))}))}),self.addEventListener("fetch",function(e){e.respondWith(caches.match(e.request).then(function(t){return t||fetch(e.request)}))})}}();