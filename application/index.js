"use strict";

import {
  bottom_bar,
  side_toaster,
  load_ads,
  top_bar,
  getManifest,
  validate_url,
  pick_file,
  list_files,
  volume_control,
  setTabindex,
} from "./assets/js/helper.js";
import { mastodon_account_info } from "./assets/js/mastodon.js";
import localforage from "localforage";
import { detectMobileOS } from "./assets/js/helper.js";
import m from "mithril";
import * as sanitizeHtml from "sanitize-html";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import fxparser from "fast-xml-parser";
import Timeworker from "./worker.js";
import swiped from "swiped-events";

import "core-js/stable";
import "regenerator-runtime/runtime";

// Extend dayjs with the duration plugin
dayjs.extend(duration);

let articles = [];
let downloadList = [];

localforage
  .getItem("downloadList")
  .then((e) => {
    downloadList = e;
  })
  .catch((downloadList = []));

const sw_channel = new BroadcastChannel("sw-messages");

const parser = new fxparser.XMLParser({
  ignoreAttributes: false,
  parseAttributeValue: true,
});

if (navigator.mozAlarms) {
  // Define the worker script as a string
  const workerCode = `
  self.onmessage = function(e) {
    console.log('Message received from main script:', e.data);
    const result = e.data * 2; // Example computation
    self.postMessage(result); // Send result back
  };
`;

  // Create a Blob from the script
  const blob = new Blob([workerCode], { type: "application/javascript" });

  // Create a URL for the Blob
  const workerURL = URL.createObjectURL(blob);

  // Create a worker from the Blob URL
  const worker = new Worker(workerURL);

  // Send a message to the worker
  setTimeout(() => {
    worker.postMessage(10);
  }, 20000);

  // Receive messages from the worker
  worker.onmessage = function (e) {
    console.log("Message received from worker:", e.data);
  };
}

//webActivity KaiOS 3

try {
  navigator.serviceWorker
    .register(new URL("./sw.js", import.meta.url), {
      type: "module",
    })
    .then((registration) => {
      // Check if a service worker is waiting to be activated
      if (registration.waiting) {
        console.log("A waiting Service Worker is already in place.");
        registration.update();
      }

      if ("b2g" in navigator) {
        // Subscribe to system messages if available
        if (registration.systemMessageManager) {
          registration.systemMessageManager.subscribe("activity").then(
            () => {
              console.log("Subscribed to general activity.");
            },
            (error) => {
              alert("Error subscribing to activity:", error);
            }
          );
        } else {
          alert("systemMessageManager is not available.");
        }
      }
    })
    .catch((error) => {
      alert("Service Worker registration failed:", error);
    });
} catch (e) {
  alert("Error during Service Worker setup:", e);
}

export let status = {
  visibility: true,
  deviceOnline: true,
  notKaiOS: true,
  os: detectMobileOS(),
  debug: false,
  local_opml: [],
};

const userAgent = navigator.userAgent || "";
if (userAgent && userAgent.includes("KAIOS")) {
  status.notKaiOS = false;
}

let current_article = "";
const proxy = "https://api.cors.lol/?url=";

let default_settings = {
  "opml_url":
    "https://raw.githubusercontent.com/strukturart/feedolin/master/example.opml",
  "opml_local": "",
  "proxy_url": "https://api.cors.lol/?url=",
  "cache_time": 3600,
};
//store all articles id to compare
let articlesID = [];

export let settings = {};
let channels = [];
let read_articles = [];
// Load the array from localForage (on app startup)
localforage
  .getItem("read_articles")
  .then((value) => {
    if (value === null) {
      // Item does not exist, initialize it as an empty array
      read_articles = [];
      return localforage.setItem("read_articles", read_articles).then(() => {});
    } else {
      read_articles = value;
    }
  })
  .catch((err) => {
    console.error("Error accessing localForage:", err);
  });

let reload_data = () => {
  start_loading();
};

function add_read_article(id) {
  // Add the article to the global array
  let ids = [];
  articles.map((h, i) => {
    ids.push(h.id);
  });

  //clean
  read_articles = read_articles.filter((article) => ids.includes(id));

  read_articles.push(id);

  // Sync the updated array with localForage
  localforage
    .setItem("read_articles", read_articles)
    .then(() => {})
    .catch((err) => {
      console.error("Error updating localForage:", err);
    });
}

let xml_parser = new DOMParser();

if (!status.notKaiOS) {
  const scripts = [
    "http://127.0.0.1/api/v1/shared/core.js",
    "http://127.0.0.1/api/v1/shared/session.js",
    "http://127.0.0.1/api/v1/apps/service.js",
    "http://127.0.0.1/api/v1/audiovolumemanager/service.js",
    "./assets/js/kaiads.v5.min.js",
  ];

  scripts.forEach((src) => {
    const js = document.createElement("script");
    js.type = "text/javascript";
    js.src = src;
    document.head.appendChild(js);
  });
}

if (status.debug) {
  window.onerror = function (msg, url, linenumber) {
    alert(
      "Error message: " + msg + "\nURL: " + url + "\nLine Number: " + linenumber
    );
    return true;
  };
}

let mastodon_connect = () => {
  localforage.getItem("settings").then(function (value) {
    settings = value;

    var currentUrl = window.location.href;
    const params = new URLSearchParams(currentUrl.split("?")[1]);
    const code = params.get("code");
    if (code) {
      let result = code.split("#")[0];
      if (code) {
        localforage.setItem("mastodon_code", result);
        var myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/x-www-form-urlencoded");

        var urlencoded = new URLSearchParams();
        urlencoded.append("code", result);
        urlencoded.append("scope", "read");

        urlencoded.append("grant_type", "authorization_code");
        urlencoded.append("redirect_uri", process.env.redirect);
        urlencoded.append("client_id", process.env.clientId);
        urlencoded.append("client_secret", process.env.clientSecret);

        var requestOptions = {
          method: "POST",
          headers: myHeaders,
          body: urlencoded,
          redirect: "follow",
        };

        fetch(settings.mastodon_server_url + "/oauth/token", requestOptions)
          .then((response) => response.json()) // Parse the JSON once
          .then((data) => {
            settings.mastodon_token = data.access_token; // Access the token
            localforage.setItem("settings", settings);
            m.route.set("/start?index=0");

            side_toaster("Successfully connected", 10000);
          })
          .catch((error) => {
            console.error("Error:", error);
            side_toaster("Connection failed");
          });
      }
    }
  });
};

//open KaiOS app
let app_launcher = () => {
  var currentUrl = window.location.href;

  // Check if the URL includes 'id='
  if (!currentUrl.includes("code=")) return false;

  const params = new URLSearchParams(currentUrl.split("?")[1]);
  const code = params.get("code");

  if (!code) return false;

  let result = code.split("#")[0];

  setTimeout(() => {
    try {
      const activity = new MozActivity({
        name: "feedolin",
        data: result,
      });
      activity.onsuccess = function () {
        console.log("Activity successfuly handled");
        setTimeout(() => {
          window.close();
        }, 4000);
      };

      activity.onerror = function () {
        console.log("The activity encouter en error: " + this.error);
        alert(this.error);
      };
    } catch (e) {}

    if ("b2g" in navigator) {
      try {
        let activity = new WebActivity("feedolin", {
          name: "feedolin",
          data: result,
        });
        activity.start().then(
          (rv) => {
            setTimeout(() => {
              window.close();
            }, 3000);

            // alert(rv);
          },
          (err) => {
            //alert(err);

            if (err == "NO_PROVIDER") {
            }
          }
        );
      } catch (e) {
        alert(e);
      }
    }
  }, 2000);
};
app_launcher();

function stringToHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char; // Bitwise shift
    hash |= 0; // Convert to 32-bit integer
  }
  return hash.toString(36); // Convert to base-36 for a shorter result
}

//test if device online and proxy server accesible server
let checkOnlineStatus = async () => {
  return status.deviceOnline;
};

//media check
let check_media = (h) => {
  const hasAudio =
    h.enclosure &&
    h.enclosure["@_type"] &&
    h.enclosure["@_type"].includes("audio");

  const hasVideo =
    h.enclosure &&
    h.enclosure["@_type"] &&
    h.enclosure["@_type"].includes("video");

  if (hasAudio) {
    return "audio";
  } else if (hasVideo) {
    return "video";
  } else {
    return "text";
  }
};

//clean input
let clean = (i) => {
  return sanitizeHtml(i, {
    allowedTags: ["b", "i", "em", "strong", "a", "img", "src", "p"],
    allowedAttributes: {
      "a": ["href"],
      "img": ["src"],
    },
  });
};

let raw = (i) => {
  return sanitizeHtml(i, {
    allowedTags: [],
    allowedAttributes: {},
  });
};

const fetchOPML = (url) => {
  let t = url;
  let xhr = null;
  if (status.notKaiOS) {
    t = settings.proxy_url + url;
    xhr = new XMLHttpRequest();
  } else {
    xhr = new XMLHttpRequest({ "mozSystem": true });
  }

  xhr.open("GET", t, true);
  xhr.setRequestHeader("Accept", "application/xml");

  xhr.onload = function () {
    if (xhr.status >= 200 && xhr.status < 300) {
      side_toaster("Data loaded successfully", 3000);
      load_feeds(xhr.responseText);
    } else {
      handleHttpError(xhr.status);
    }
  };

  xhr.onerror = function () {
    handleRequestError();
  };

  xhr.send();
};

const handleHttpError = (status) => {
  console.error(`HTTP Error: Status ${status}`);
  side_toaster("OPML file not reachable", 8000);

  load_cached_feeds();

  // Route back to start if on intro
  let r = m.route.get();
  if (r.startsWith("/intro")) {
    m.route.set("/start");
  }
};

const handleRequestError = () => {
  console.error("Network error occurred during the request.");
  side_toaster("OPML file not reachable", 8000);

  load_cached_feeds();

  // Route back to start if on intro
  let r = m.route.get();
  if (r.startsWith("/intro")) {
    m.route.set("/start");
  }
};

const load_feeds = async (data) => {
  if (data) {
    const downloadListData = generateDownloadList(data);

    if (downloadListData.error) {
      side_toaster(downloadListData.error, 3000);
      return false;
    } else {
      downloadList = downloadListData.downloadList;
    }

    if (downloadList.length > 0) {
      // Fetch content for the feeds
      try {
        await fetchContent(downloadList);
        settings.last_update = new Date();
        localforage.setItem("settings", settings);
      } catch (error) {
        console.log(error);
      }
    } else {
      alert("Generated download list is empty.");
    }
  } else {
    console.error("No OPML content found.");
  }
};

const generateDownloadList = (data) => {
  // Parse the OPML data
  const xmlDoc = xml_parser.parseFromString(data, "text/xml");

  // Check if the OPML file is valid
  if (!xmlDoc || xmlDoc.getElementsByTagName("parsererror").length > 0) {
    console.error("Invalid OPML data.");
    m.route.set("/start");
    return { error: "Invalid OPML data", downloadList: [] };
  }

  const content = xmlDoc.querySelector("body");

  if (!content) {
    console.error("No 'body' element found in the OPML data.");
    return { error: "No 'body' element found", downloadList: [] };
  }

  let index = 0;
  const outlines = content.querySelectorAll("outline");
  downloadList = [];

  outlines.forEach((outline) => {
    const nestedOutlines = outline.querySelectorAll("outline");

    nestedOutlines.forEach((nested) => {
      const url = nested.getAttribute("xmlUrl");
      if (!url) return; // Skip if no url attribute

      // Add feed to the download list
      downloadList.push({
        error: "",
        title: nested.getAttribute("title") || "Untitled",
        url: url,
        index: index++,
        channel: outline.getAttribute("text") || "Unknown",
        type: nested.getAttribute("type") || "rss",
        maxEpisodes: nested.getAttribute("maxEpisodes") || 5,
      });
    });
  });

  return { error: "", downloadList }; // Return the generated list with no error
};

const fetchContent = async (feed_download_list) => {
  articles = [];
  channels = [];
  downloadList = feed_download_list;

  localforage.setItem("downloadList", downloadList);

  let completedFeeds = 0; // Counter to track how many feeds have finished loading
  const totalFeeds = feed_download_list.length; // Total number of feeds to be fetched

  // Function to check if all feeds are loaded
  let first = false;

  const checkIfAllFeedsLoaded = () => {
    channel_filter = localStorage.getItem("last_channel_filter");
    if (completedFeeds === totalFeeds) {
      console.log("All feeds are loaded");
      // All feeds are done loading, you can proceed with further actions
      //cache data

      localforage
        .setItem("articles", articles)
        .then(() => {
          articles.sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));

          articles.forEach((e) => {
            if (channels.indexOf(e.channel) === -1 && e.channel) {
              channels.push(e.channel);
            }
          });

          if (channels.length > 0 && !first) {
            //todo check if last_channel exist in array
            channel_filter =
              localStorage.getItem("last_channel_filter") || channels[0];
            first = true;
          }

          m.route.set("/start");
        })
        .catch((err) => {
          console.error("Feeds cached", err);
        });

      let r = m.route.get();
      if (r.startsWith("/intro")) m.route.set("/start");
    }
  };

  let ids = [];

  feed_download_list.forEach((e) => {
    if (e.type === "mastodon") {
      fetch(e.url)
        .then((response) => response.json())
        .then((data) => {
          data.forEach((k, i) => {
            if (i > 5) return;

            let f = {
              channel: e.channel,
              id: k.id,
              type: "mastodon",
              pubDate: k.created_at,
              isoDate: k.created_at,
              title: k.account.display_name || k.account.username,
              content: k.content,
              url: k.uri,
              reblog: false,
            };

            if (k.media_attachments.length > 0) {
              if (k.media_attachments[0].type === "image") {
                f.content += `<br><img src='${k.media_attachments[0].preview_url}'>`;
              } else if (k.media_attachments[0].type === "video") {
                f.enclosure = {
                  "@_type": "video",
                  url: k.media_attachments[0].url,
                };
              } else if (k.media_attachments[0].type === "audio") {
                f.enclosure = {
                  "@_type": "audio",
                  url: k.media_attachments[0].url,
                };
              }
            }

            //reblog
            if (k.content == "") {
              f.content = k.reblog.content;

              f.reblog = true;
              f.reblogUser = k.account.display_name || k.reblog.account.acct;

              if (k.reblog.media_attachments.length > 0) {
                if (k.reblog.media_attachments[0].type === "image") {
                  f.content += `<br><img src='${k.reblog.media_attachments[0].preview_url}'>`;
                } else if (k.reblog.media_attachments[0].type === "video") {
                  f.enclosure = {
                    "@_type": "video",
                    url: k.reblog.media_attachments[0].url,
                  };
                } else if (k.reblog.media_attachments[0].type === "audio") {
                  f.enclosure = {
                    "@_type": "audio",
                    url: k.reblog.media_attachments[0].url,
                  };
                }
              }
            }

            articles.push(f);
          });
        })
        .catch((error) => {
          e.error = error;
        })
        .finally(() => {
          completedFeeds++; // Increment the counter when a feed is done
          checkIfAllFeedsLoaded(); // Check if all feeds are done
        });
    } else {
      let xhr = new XMLHttpRequest({ "mozSystem": true });
      xhr.timeout = 2000;

      let url = e.url;
      if (status.notKaiOS) {
        xhr.open("GET", proxy + url, true);
      } else {
        xhr.open("GET", url, true);
      }

      xhr.ontimeout = function () {
        console.error("Request timed out");
        e.error = "timeout";
        completedFeeds++;
        checkIfAllFeedsLoaded();
      };

      xhr.onload = function () {
        if (xhr.status !== 200) {
          e.error = xhr.status;
          completedFeeds++;
          checkIfAllFeedsLoaded();
          return;
        }

        let data = xhr.response;
        if (!data) {
          e.error = xhr.status;
          completedFeeds++;
          checkIfAllFeedsLoaded();
          return;
        }
        try {
          let jObj = parser.parse(data);

          //ATOM
          if (jObj.feed)
            jObj.feed.entry.forEach((f, i) => {
              if (i < e.maxEpisodes) {
                try {
                  f.channel = e.channel;
                  f.id = stringToHash(f.title + f.published);
                  f.type = f["yt:videoId"] ? "youtube" : "text";
                  f.url = f.link["@_href"];
                  f.feed_title = e.title;
                  f.typeOfFeed = "ATOM";
                  f.reblog = false;

                  if (f["yt:videoId"]) f.youtubeid = f["yt:videoId"];

                  if (dayjs(f.published).isValid()) {
                    f.isoDate = dayjs(f.published).toISOString();
                  } else {
                    f.isoDate = dayjs("1970-01-01").toISOString(); // Standard fallback date
                  }
                  f.content =
                    typeof f.content === "object"
                      ? f.content["#text"]
                      : f.content;

                  if (f["media:group"]) {
                    f.cover = f["media:group"]["media:thumbnail"]["@_url"];
                    f.content = f["media:group"]["media:description"];
                  }

                  if (f["media:thumbnail"]) {
                    f.cover = f["media:thumbnail"]["@_url"];
                  }

                  if (!ids.includes(f.id)) {
                    articles.push(f);
                    ids.push(f.id); // Add the ID to the tracking array
                  }
                } catch (e) {
                  console.log(e);
                }
              }
            });

          //RSS
          if (jObj.rss)
            jObj.rss.channel.item.forEach((f, i) => {
              if (i < e.maxEpisodes) {
                try {
                  f.channel = e.channel;
                  f.id = stringToHash(f.title + f.pubDate);
                  f.type = check_media(f);
                  f.url = f.link || e.url;

                  f.feed_title = e.title;
                  f.typeOfFeed = "RSS";
                  f.reblog = false;

                  if (
                    dayjs(
                      f.pubDate,
                      "ddd, DD MMM YYYY HH:mm:ss Z",
                      true
                    ).isValid()
                  ) {
                    f.isoDate = dayjs(
                      f.pubDate,
                      "ddd, DD MMM YYYY HH:mm:ss Z"
                    ).toISOString();
                  } else {
                    f.isoDate = dayjs("1970-01-01").toISOString(); // Standard fallback date
                  }

                  f.content = f.content || f.description;

                  if (f["itunes:image"]) {
                    f.cover = f["itunes:image"]["@_href"];
                  }

                  if (jObj.rss.channel.image) {
                    f.cover = jObj.rss.channel.image.url || "";
                  }

                  if (!ids.includes(f.id)) {
                    articles.push(f);
                    ids.push(f.id); // Add the ID to the tracking array
                  }
                } catch (e) {
                  console.log(e);
                }
              }
            });

          completedFeeds++; // Increment the counter
          checkIfAllFeedsLoaded(); // Check if all feeds are done
        } catch (event) {
          e.error = event;

          completedFeeds++; // Increment the counter
          checkIfAllFeedsLoaded(); // Check if all feeds are done
        }
      };

      xhr.onerror = function (event) {
        e.error = event;
        completedFeeds++; // Increment the counter in case of error
        checkIfAllFeedsLoaded();
      };

      xhr.send();
    }
  });
};

//Mastadon private
let load_mastodon = async () => {
  let accessToken = settings.mastodon_token;

  let url = settings.mastodon_server_url + "/api/v1/timelines/home";

  fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => response.json())
    .then((data) => {
      data.forEach((k, i) => {
        if (i > 15) return;

        let f = {
          channel: "Mastodon",
          id: k.id,
          type: "mastodon",
          pubDate: k.created_at,
          isoDate: k.created_at,
          title: k.account.display_name,
          content: k.content,
          url: k.uri,
          reblog: false,
        };

        if (k.media_attachments.length > 0) {
          if (k.media_attachments[0].type === "image") {
            f.content += `<br><img src='${k.media_attachments[0].preview_url}'>`;
          } else if (k.media_attachments[0].type === "video") {
            f.enclosure = {
              "@_type": "video",
              url: k.media_attachments[0].url,
            };
          } else if (k.media_attachments[0].type === "audio") {
            f.enclosure = {
              "@_type": "audio",
              url: k.media_attachments[0].url,
            };
          }
        }

        //reblog
        try {
          if (k.content == "") {
            f.content = k.reblog.content;

            f.reblog = true;
            f.reblogUser =
              k.reblog.account.display_name || k.reblog.account.acct;

            if (k.reblog.media_attachments.length > 0) {
              if (k.reblog.media_attachments[0].type === "image") {
                f.content += `<br><img src='${k.reblog.media_attachments[0].preview_url}'>`;
              } else if (k.reblog.media_attachments[0].type === "video") {
                f.enclosure = {
                  "@_type": "video",
                  url: k.reblog.media_attachments[0].url,
                };
              } else if (k.reblog.media_attachments[0].type === "audio") {
                f.enclosure = {
                  "@_type": "audio",
                  url: k.reblog.media_attachments[0].url,
                };
              }
            }
          }
        } catch (e) {
          console.log(e);
        }

        articles.push(f);
      });
      channels.push("Mastodon");
      side_toaster("Logged in as " + status.mastodon_logged, 4000);

      localforage.setItem("articles", articles).then(() => {
        console.log("cached");
      });
    });
};

let start_loading = () => {
  fetchOPML(settings.opml_url);
  if (settings.opml_local) {
    load_feeds(settings.opml_local);
  }
  //load mastodon
  if (settings.mastodon_token) {
    mastodon_account_info(settings.mastodon_server_url, settings.mastodon_token)
      .then((f) => {
        status.mastodon_logged = f.display_name;
        load_mastodon();
      })
      .catch((e) => {});
  }

  channel_filter = localStorage.getItem("last_channel_filter");
};

let load_cached_feeds = () => {
  localforage
    .getItem("articles")
    .then((value) => {
      articles = value;

      articles.sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));

      articles.forEach((e) => {
        if (channels.indexOf(e.channel) === -1 && e.channel) {
          channels.push(e.channel);
        }
      });

      if (channels.length) {
        channel_filter =
          localStorage.getItem("last_channel_filter") || channels[0];
      }

      m.route.set("/start?index=0");
      document.querySelector("body").classList.add("cache");

      side_toaster("Cached feeds loaded", 4000);
    })
    .catch((err) => {});
};

localforage
  .getItem("settings")
  .then(function (value) {
    if (value == null) {
      settings = default_settings;
      localforage
        .setItem("settings", settings)
        .then(function (value) {})
        .catch(function (err) {
          console.log(err);
        });
    }
    settings = value;
    //todo set value in settings view, default is 1h
    settings.cache_time = settings.cache_time || 3600;

    if (settings.last_update) {
      status.last_update_duration =
        new Date() / 1000 - settings.last_update / 1000;
    } else {
      status.last_update_duration = 3600;
    }

    if (!settings.opml_url && !settings.opml_local_filename) {
      side_toaster(
        "The feed could not be loaded because no OPML was defined in the settings.",
        6000
      );

      settings = default_settings;
      localforage
        .setItem("settings", settings)
        .then(function (value) {})
        .catch(function (err) {});
    }

    checkOnlineStatus().then((isOnline) => {
      //is online use offline data or not
      if (isOnline && status.last_update_duration > settings.cache_time) {
        start_loading();
        side_toaster("Load feeds", 4000);

        //load mastodon acc info
        if (settings.mastodon_token) {
          mastodon_account_info(
            settings.mastodon_server_url,
            settings.mastodon_token
          )
            .then((f) => {
              status.mastodon_logged = f.display_name;
            })
            .catch((e) => {});
        }
      } else {
        load_cached_feeds();
      }
    });
  })
  .catch(function (err) {
    // This code runs if there were any errors
    side_toaster("The default settings was loaded", 3000);
    settings = default_settings;
    fetchOPML(settings.opml_url);

    localforage
      .setItem("settings", settings)
      .then(function (value) {})
      .catch(function (err) {
        console.log(err);
      });
  });

var root = document.getElementById("app");

var options = {
  view: function () {
    return m(
      "div",
      {
        id: "optionsView",
        class: "flex",
        oncreate: () => {
          top_bar("", "", "");

          if (status.notKaiOS)
            top_bar("<img src='assets/icons/back.svg'>", "", "");

          bottom_bar(
            "",
            "<img class='not-desktop' src='assets/icons/select.svg'>",
            ""
          );

          if (status.notKaiOS) bottom_bar("", "", "");
        },
      },
      [
        m(
          "button",
          {
            tabindex: 0,

            class: "item",
            oncreate: ({ dom }) => {
              dom.focus();

              scrollToCenter();
            },
            onclick: () => {
              m.route.set("/about");
            },
          },
          "About"
        ),
        m(
          "button",
          {
            tabindex: 1,

            class: "item",
            onclick: () => {
              m.route.set("/settingsView");
            },
          },
          "Settings"
        ),

        m(
          "button",
          {
            tabindex: 2,

            class: "item",
            onclick: () => {
              m.route.set("/privacy_policy");
            },
          },
          "Privacy Policy"
        ),
        m(
          "button",
          {
            tabindex: 3,

            class: "item",
            onclick: () => {
              m.route.set("/subscriptionsView");
            },
          },
          "Subscriptions"
        ),
        m("div", {
          id: "KaiOSads-Wrapper",
          class: "",

          oncreate: () => {
            if (status.notKaiOS == false) load_ads();
          },
        }),
      ]
    );
  },
};

let counter = -1;
let channel_filter = localStorage.getItem("last_channel_filter") || "";

let page_index = 0;

var start = {
  view: function () {
    const filteredArticles = articles.filter(
      (h) => channel_filter === "" || channel_filter === h.channel
    );

    articles.forEach((e) => {
      articlesID.push(e.id);
    });
    localStorage.setItem("last_channel_filter", channel_filter);

    return m(
      "div",
      {
        id: "start",
        oncreate: () => {
          page_index = m.route.param("index") || 0;

          bottom_bar(
            "<img src='assets/icons/save.svg'>",
            "<img src='assets/icons/select.svg'>",
            "<img src='assets/icons/option.svg'>"
          );

          if (status.notKaiOS)
            bottom_bar(
              "<img src='assets/icons/save.svg'>",
              "",
              "<img src='assets/icons/option.svg'>"
            );

          if (status.notKaiOS) top_bar("", "", "");

          if (status.notKaiOS && status.player)
            top_bar("", "", "<img src='assets/icons/play.svg'>");
        },
      },
      m("span", { class: "channel", oncreate: () => {} }, channel_filter),
      // Loop through filteredArticles and create an article for each
      filteredArticles.map((h, i) => {
        const readClass = read_articles.includes(h.id) ? "read" : "";

        return m(
          "article",
          {
            class: `item ${readClass}`,
            "data-id": h.id,
            "data-type": h.type,
            oncreate: (vnode) => {
              // Set tabindex after all articles are rendered
              if (page_index == 0 && i == 0) {
                setTimeout(() => {
                  vnode.dom.focus();
                }, 1200);
              } else {
                if (h.id == page_index) {
                  setTimeout(() => {
                    vnode.dom.focus();
                    scrollToCenter();
                  }, 1200);
                }
              }

              if (i == filteredArticles.length - 1)
                setTimeout(() => {
                  document.querySelectorAll(".item").forEach((e, k) => {
                    e.setAttribute("tabindex", k);
                  });
                }, 1000);
            },
            onclick: () => {
              m.route.set("/article?index=" + h.id);

              add_read_article(h.id);
            },
            onkeydown: (e) => {
              if (e.key === "Enter") {
                m.route.set("/article?index=" + h.id);
                add_read_article(h.id);
              }
            },
          },
          [
            m("span", { class: "type-indicator" }, h.type),
            m("time", dayjs(h.isoDate).format("DD MMM YYYY")),
            m(
              "h2",
              {
                oncreate: ({ dom }) => {
                  if (h.reblog === true) {
                    dom.classList.add("reblog");
                  }
                },
              },
              clean(h.feed_title)
            ),
            m("h3", clean(h.title)),
            h.type == "mastodon"
              ? m("h3", raw(h.content.substring(0, 30)) + "...")
              : null,
          ]
        );
      })
    );
  },
};

var article = {
  view: function () {
    const matchedArticle = articles.find((h) => {
      var index = m.route.param("index");
      if (index != h.id) return false;

      current_article = h;
      return true;
    });

    return m(
      "div",
      {
        id: "article",
        class: "page",
        oncreate: () => {
          if (status.notKaiOS)
            top_bar("<img src='assets/icons/back.svg'>", "", "");
          bottom_bar("<img src='assets/icons/link.svg'>", "", "");
        },
      },
      matchedArticle
        ? m(
            "article",
            {
              class: "item",
              tabindex: 0,
              oncreate: (vnode) => {
                vnode.dom.focus();
                if (
                  matchedArticle.type === "audio" ||
                  matchedArticle.type === "video" ||
                  matchedArticle.type === "youtube"
                ) {
                  bottom_bar(
                    "<img src='assets/icons/link.svg'>",
                    "",
                    "<img src='assets/icons/play.svg'>"
                  );
                }
              },
            },
            [
              m(
                "time",
                {
                  id: "top",
                  oncreate: () => {
                    setTimeout(() => {
                      document.querySelector("#top").scrollIntoView();
                    }, 1000);
                  },
                },
                dayjs(matchedArticle.isoDate).format("DD MMM YYYY")
              ),
              m(
                "h2",
                {
                  class: "article-title",
                  oncreate: ({ dom }) => {
                    if (matchedArticle.reblog) dom.classList.add("reblog");
                  },
                },
                matchedArticle.title
              ),
              m("div", { class: "text" }, [
                m.trust(clean(matchedArticle.content)),
              ]),
              matchedArticle.reblog
                ? m(
                    "div",
                    { class: "text" },
                    "reblogged from:" + matchedArticle.reblogUser
                  )
                : "",
            ]
          )
        : m("div", "Article not found") // Fallback if no match
    );
  },
};

//KaiOS 3
var localOPML = {
  view: function () {
    return m(
      "div",
      {
        class: "flex",
        id: "index",
        oncreate: () => {
          if (status.notKaiOS)
            top_bar("<img src='assets/icons/back.svg'>", "", "");
          bottom_bar("", "", "");
        },
      },
      status.local_opml.map((h, i) => {
        let filename = h.split("/");
        filename = filename[filename.length - 1];

        return m(
          "button",
          {
            class: "item",
            tabindex: i,
            oncreate: (vnode) => {
              if (i == 0) vnode.dom.focus();
            },
            onclick: () => {
              if ("b2g" in navigator) {
                try {
                  let sdcard = navigator.b2g.getDeviceStorage("sdcard");
                  let request = sdcard.get(h);
                  request.onsuccess = function () {
                    const reader = new FileReader();

                    reader.onload = () => {
                      const downloadListData = generateDownloadList(
                        reader.result
                      );
                      if (downloadListData.error) {
                        side_toaster("OPML file not valid", 4000);
                      } else {
                        settings.opml_local = reader.result;
                        settings.opml_local_filename = filename;
                        localforage.setItem("settings", settings).then(() => {
                          side_toaster("OPML file added", 4000);
                          m.route.set("/settingsView");
                        });
                      }
                    };

                    reader.onerror = () => {
                      side_toaster("OPML file not valid", 4000);
                    };

                    reader.readAsText(this.result);
                  };
                  request.onerror = function (error) {};
                } catch (e) {}
              } else {
                let sdcard = navigator.getDeviceStorage("sdcard");
                let request = sdcard.get(h);

                request.onsuccess = function () {
                  const reader = new FileReader();

                  reader.onload = () => {
                    const downloadListData = generateDownloadList(
                      reader.result
                    );
                    if (downloadListData.error) {
                      side_toaster("OPML file not valid", 4000);
                    } else {
                      settings.opml_local = reader.result;
                      settings.opml_local_filename = filename;
                      localforage.setItem("settings", settings).then(() => {
                        side_toaster("OPML file added", 4000);
                        m.route.set("/settingsView");
                      });
                    }
                  };

                  reader.onerror = () => {
                    side_toaster("OPML file not valid", 4000);
                  };

                  reader.readAsText(this.result);
                };
                request.onerror = function (error) {};
              }
            },
          },
          filename
        );
      })
    );
  },
};

var intro = {
  view: function () {
    return m(
      "div",
      {
        class: "width-100 height-100",
        id: "intro",
        oninit: () => {
          //check if is a mastodon redirect
          if (status.notKaiOS) mastodon_connect();
        },
        onremove: () => {
          localStorage.setItem("version", status.version);
          document.querySelector(".loading-spinner").style.display = "none";
        },
      },
      [
        m("img", {
          src: "./assets/icons/intro.svg",

          oncreate: () => {
            document.querySelector(".loading-spinner").style.display = "block";
            let get_manifest_callback = (e) => {
              try {
                status.version = e.manifest.version;
                document.querySelector("#version").textContent =
                  e.manifest.version;
              } catch (e) {}

              if ("b2g" in navigator || status.notKaiOS) {
                fetch("/manifest.webmanifest")
                  .then((r) => r.json())
                  .then((parsedResponse) => {
                    status.version = parsedResponse.b2g_features.version;
                  });
              }
            };
            getManifest(get_manifest_callback);
          },
        }),
        m(
          "div",
          {
            class: "flex width-100  justify-content-center ",
            id: "version-box",
          },
          [
            m(
              "kbd",
              {
                id: "version",
              },
              localStorage.getItem("version") || 0
            ),
          ]
        ),
      ]
    );
  },
};

// Format time using dayjs
const formatTime = (seconds) => {
  return dayjs.duration(seconds, "seconds").format("mm:ss");
};

// VideoPlayerView definition
const VideoPlayerView = {
  videoElement: null, // Store video element
  videoDuration: 0, // Store video duration
  currentTime: 0, // Store current time of the video
  isPlaying: false, // Track play state
  seekAmount: 5, // Seek by 5 seconds

  oncreate: ({ attrs }) => {
    if (status.notKaiOS) top_bar("<img src='assets/icons/back.svg'>", "", "");
    // Mount the video element to the DOM when the component is created
    VideoPlayerView.videoElement = document.createElement("video");
    const videoContainer = document.getElementById("video-container");
    videoContainer.appendChild(VideoPlayerView.videoElement);

    // Load the video URL from the route parameter
    const videoUrl = attrs.url;
    if (videoUrl) {
      VideoPlayerView.videoElement.src = videoUrl;
      VideoPlayerView.videoElement.play();
      VideoPlayerView.isPlaying = true;
    }

    // Set up an event listener to capture the duration and update progress
    VideoPlayerView.videoElement.onloadedmetadata = () => {
      VideoPlayerView.videoDuration = VideoPlayerView.videoElement.duration;
      m.redraw(); // Force a redraw to update the UI with the duration
    };

    // Update the current time and redraw progress bar as video plays
    VideoPlayerView.videoElement.ontimeupdate = () => {
      VideoPlayerView.currentTime = VideoPlayerView.videoElement.currentTime;
      m.redraw(); // Update UI with the current time and progress
    };

    // Activate local controls with keyboard events
    document.addEventListener("keydown", VideoPlayerView.handleKeydown);
  },

  onremove: () => {
    // Remove the keydown listener when the view is removed
    document.removeEventListener("keydown", VideoPlayerView.handleKeydown);
  },

  handleKeydown: (e) => {
    if (e.key === "Enter") {
      VideoPlayerView.togglePlayPause();
    } else if (e.key === "ArrowLeft") {
      VideoPlayerView.seek("left");
    } else if (e.key === "ArrowRight") {
      VideoPlayerView.seek("right");
    }
  },

  togglePlayPause: () => {
    if (VideoPlayerView.isPlaying) {
      VideoPlayerView.videoElement.pause();
    } else {
      VideoPlayerView.videoElement.play();
    }
    VideoPlayerView.isPlaying = !VideoPlayerView.isPlaying;
  },

  seek: (direction) => {
    const currentTime = VideoPlayerView.videoElement.currentTime;
    if (direction === "left") {
      VideoPlayerView.videoElement.currentTime = Math.max(
        0,
        currentTime - VideoPlayerView.seekAmount
      );
    } else if (direction === "right") {
      VideoPlayerView.videoElement.currentTime = Math.min(
        VideoPlayerView.videoDuration,
        currentTime + VideoPlayerView.seekAmount
      );
    }
  },

  view: ({ attrs }) => {
    // Calculate progress as a percentage
    const progressPercent =
      VideoPlayerView.videoDuration > 0
        ? (VideoPlayerView.currentTime / VideoPlayerView.videoDuration) * 100
        : 0;

    return m("div", { class: "video-player" }, [
      m("div", { id: "video-container", class: "video-container" }), // Video element will be mounted here

      m("div", { class: "video-info" }, [
        ` ${formatTime(VideoPlayerView.currentTime)} / ${formatTime(
          VideoPlayerView.videoDuration
        )}`,
      ]),

      // Progress bar container
      m("div", { class: "progress-bar-container" }, [
        m("div", {
          class: "progress-bar",
          style: { width: `${progressPercent}%` },
        }),
      ]),
    ]);
  },
};

//youtube
const YouTubePlayerView = {
  player: null, // Store the YouTube player instance

  oncreate: ({ attrs }) => {
    if (status.notKaiOS) top_bar("<img src='assets/icons/back.svg'>", "", "");

    bottom_bar("", "", "");

    if (YT) {
      // Create the YouTube player instance and assign it to YouTubePlayerView.player
      YouTubePlayerView.player = new YT.Player("video-container", {
        videoId: attrs.videoId, // Load video ID from the route or attributes
        events: {
          onReady: YouTubePlayerView.onPlayerReady, // Trigger this when the player is ready
        },
      });
    } else {
      alert("YouTube player not loaded");
    }

    // Listen for keydown events
    document.addEventListener("keydown", YouTubePlayerView.handleKeydown);
  },

  onPlayerReady: (event) => {
    // Automatically play the video when the player is ready
    event.target.playVideo();
  },

  handleKeydown: (e) => {
    if (e.key === "Enter") {
      YouTubePlayerView.togglePlayPause();
    } else if (e.key === "ArrowLeft") {
      YouTubePlayerView.seek("left");
    } else if (e.key === "ArrowRight") {
      YouTubePlayerView.seek("right");
    }
  },

  togglePlayPause: () => {
    const state = YouTubePlayerView.player.getPlayerState();
    if (state === 1) {
      // 1 indicates the player is playing
      YouTubePlayerView.player.pauseVideo();
    } else {
      YouTubePlayerView.player.playVideo();
    }
  },

  seek: (direction) => {
    const currentTime = YouTubePlayerView.player.getCurrentTime();
    const seekAmount = 5; // 5 seconds step
    if (direction === "left") {
      YouTubePlayerView.player.seekTo(
        Math.max(0, currentTime - seekAmount),
        true
      );
    } else if (direction === "right") {
      YouTubePlayerView.player.seekTo(currentTime + seekAmount, true);
    }
  },

  view: () => {
    return m("div", { class: "youtube-player" }, [
      m("div", { id: "video-container", class: "video-container" }), // YouTube iframe player will be injected here
    ]);
  },
};

// Define the audio element globally
const globalAudioElement = document.createElement("audio");
globalAudioElement.preload = "auto";
globalAudioElement.src = "";

if ("b2g" in navigator) {
  try {
    globalAudioElement.mozAudioChannelType = "content";

    // For controlling the system audio channel
    if (navigator.b2g.AudioChannelManager) {
      navigator.b2g.AudioChannelManager.volumeControlChannel = "content";
    }
  } catch (e) {
    console.log(e);
  }
}
if (navigator.mozAlarms) {
  globalAudioElement.mozAudioChannelType = "content";
}

let hasPlayedAudio = [];

try {
  localforage.getItem("hasPlayedAudio").then((value) => {
    hasPlayedAudio = value || []; // If no data, initialize as an empty array
  });
} catch (error) {
  console.error("Failed to load hasPlayedAudio:", error);
}

// Function to play and update audio
let playedAudio = async (url, time, id) => {
  const index = hasPlayedAudio.findIndex((e) => e.url === url);

  if (index !== -1) {
    // If the URL exists, update the time
    hasPlayedAudio[index].time = time;
  } else {
    // If the URL does not exist, push a new object
    hasPlayedAudio.push({ url, time, id });
  }

  clean_hasPlayedaudio();

  // Save the updated hasPlayedAudio array to localforage
  localforage.setItem("hasPlayedAudio", hasPlayedAudio).then(() => {});
};

let clean_hasPlayedaudio = () => {
  hasPlayedAudio = hasPlayedAudio.filter((e) => articlesID.includes(e.id));
};

let startX = 0; // Initial X position
let startY = 0; // Initial Y position
let currentX = 0; // Current X position
let currentY = 0; // Current Y position
let isSwiping = false; // Track if the user is actively swiping
let seekInterval = null;

const AudioPlayerView = {
  audioDuration: 0, // Store audio duration
  currentTime: 0, // Store current time of the audio
  isPlaying: false, // Track play state
  seekAmount: 5, // Seek by 5 seconds

  oninit: ({ attrs }) => {
    // Load the audio URL if it changes

    if (attrs.url && globalAudioElement.src !== attrs.url) {
      try {
        globalAudioElement.src = attrs.url;
        globalAudioElement.play().catch((e) => {
          alert(e);
        });
        AudioPlayerView.isPlaying = true;

        hasPlayedAudio.map((e) => {
          if (e.url === globalAudioElement.src) {
            if (confirm("continue playing ?") == true) {
              globalAudioElement.currentTime = e.time;
            }
          }
        });
      } catch (e) {
        globalAudioElement.src = attrs.url;
      }
    }

    // Set up event listeners
    globalAudioElement.onloadedmetadata = () => {
      AudioPlayerView.audioDuration = globalAudioElement.duration;
      m.redraw();
    };

    globalAudioElement.ontimeupdate = () => {
      AudioPlayerView.currentTime = globalAudioElement.currentTime;

      //store audio url to contiune to play
      playedAudio(
        globalAudioElement.src,
        globalAudioElement.currentTime,
        attrs.id
      );
      status.player = true;
      m.redraw();
    };

    // Restore play/pause state
    AudioPlayerView.isPlaying = !globalAudioElement.paused;

    // Activate local controls with keyboard events
    document.addEventListener("keydown", AudioPlayerView.handleKeydown);
  },

  oncreate: () => {
    top_bar("", "", "");
    bottom_bar("", "<img src='assets/icons/play.svg'>", "");
    if (settings.sleepTimer) {
      bottom_bar(
        "<img src='assets/icons/sleep.svg'>",
        "<img src='assets/icons/play.svg'>",
        ""
      );

      document
        .querySelector("div.button-left")
        .addEventListener("click", function () {
          status.sleepTimer
            ? stopTimer()
            : startTimer(settings.sleepTimer * 60 * 1000);
        });
    }

    if (status.notKaiOS) {
      top_bar("<img src='assets/icons/back.svg'>", "", "");

      document.addEventListener(
        "touchstart",
        AudioPlayerView.touchStartHandler
      );
      document.addEventListener("touchmove", AudioPlayerView.touchMoveHandler);
      document.addEventListener("touchend", AudioPlayerView.touchEndHandler);
    }

    document
      .querySelector("div.button-center")
      .addEventListener("click", function (event) {
        AudioPlayerView.togglePlayPause();
      });

    //toch events for non KaiOS devices
    if (status.notKaiOS) {
      const threshold = 30;
      document.addEventListener("touchstart", (event) => {
        const touch = event.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
      });

      document.addEventListener("touchmove", (event) => {
        const touch = event.touches[0];
        currentX = touch.clientX;
        currentY = touch.clientY;

        const diffX = currentX - startX;
        const diffY = currentY - startY;

        // Determine swipe direction based on the larger movement
        if (Math.abs(diffX) > Math.abs(diffY)) {
          if (diffX > threshold) {
            startContinuousSeek("right");
            isSwiping = true;
          } else if (diffX < -threshold) {
            startContinuousSeek("left");
            isSwiping = true;
          }
        } else {
          if (diffY > threshold) {
            console.log("Swiping down (not used in this context)");
          } else if (diffY < -threshold) {
            console.log("Swiping up (not used in this context)");
          }
        }
      });

      document.addEventListener("touchend", () => {
        if (isSwiping) {
          isSwiping = false;
          stopContinuousSeek();
        }
      });
    }

    function startContinuousSeek(direction) {
      let r = m.route.get();
      if (r.startsWith("/Audio")) {
        if (seekInterval) return; // Prevent multiple intervals
        AudioPlayerView.seek(direction);

        // Start a repeating interval for continuous seeking
        seekInterval = setInterval(() => {
          AudioPlayerView.seek(direction);
          document.querySelector(".audio-info").style.padding = "20px";
        }, 1000);
      }
    }

    function stopContinuousSeek() {
      if (seekInterval) {
        clearInterval(seekInterval);
        seekInterval = null;
        document.querySelector(".audio-info").style.padding = "10px";
      }
    }
  },

  onremove: () => {
    if (status.notKaiOS) {
      document.removeEventListener(
        "touchstart",
        AudioPlayerView.touchStartHandler
      );
      document.removeEventListener(
        "touchmove",
        AudioPlayerView.touchMoveHandler
      );
      document.removeEventListener("touchend", AudioPlayerView.touchEndHandler);
    }
  },

  handleKeydown: (e) => {
    if (e.key === "Enter") {
      AudioPlayerView.togglePlayPause();
    } else if (e.key === "ArrowLeft") {
      AudioPlayerView.seek("left");
    } else if (e.key === "ArrowRight") {
      AudioPlayerView.seek("right");
    }
  },

  togglePlayPause: () => {
    if (AudioPlayerView.isPlaying) {
      globalAudioElement.pause();
    } else {
      globalAudioElement.play();
    }
    AudioPlayerView.isPlaying = !AudioPlayerView.isPlaying;
  },

  seek: (direction) => {
    const currentTime = globalAudioElement.currentTime;
    if (direction === "left") {
      globalAudioElement.currentTime = Math.max(
        0,
        currentTime - AudioPlayerView.seekAmount
      );
    } else if (direction === "right") {
      globalAudioElement.currentTime = Math.min(
        AudioPlayerView.audioDuration,
        currentTime + AudioPlayerView.seekAmount
      );
    }
  },

  view: ({ attrs }) => {
    // Calculate progress as a percentage
    const progressPercent =
      AudioPlayerView.audioDuration > 0
        ? (AudioPlayerView.currentTime / AudioPlayerView.audioDuration) * 100
        : 0;

    return m("div", { class: "audio-player" }, [
      m("div", {
        id: "audio-container",
        class: "audio-container",
      }),

      m("div", {
        class: "cover-container",
        style: {
          "background-color": "rgb(121, 71, 255)",
          "background-image": `url(${current_article.cover})`,
        },
      }),
      m(
        "div",
        {
          class: "audio-info",
          style: {
            background: `linear-gradient(to right, #3498db ${progressPercent}%, white ${progressPercent}%)`,
          },
        },
        [
          `${formatTime(AudioPlayerView.currentTime)} / ${formatTime(
            AudioPlayerView.audioDuration
          )}`,
        ]
      ),

      // Progress bar container
      m("div", { class: "progress-bar-container" }, [
        m("div", {
          class: "progress-bar",
          style: { width: `${progressPercent}%` },
        }),
      ]),
    ]);
  },
};

var about = {
  view: function () {
    return m(
      "div",
      {
        class: "page scrollable",
        oncreate: () => {
          bottom_bar("", "", "");
        },
      },
      m(
        "p",
        "Feedolin is an RSS/Atom reader and podcast player, available for both KaiOS and non-KaiOS users."
      ),
      m(
        "p",
        "It supports connecting a Mastodon account to display articles alongside your RSS/Atom feeds."
      ),
      m(
        "p",
        "The app allows you to listen to audio and watch videos directly if the feed provides the necessary URLs."
      ),
      m(
        "p",
        "The list of subscribed websites and podcasts is managed either locally or via an OPML file from an external source, such as a public link in the cloud."
      ),
      m("p", "For non-KaiOS users, local files must be uploaded to the app."),
      m("h4", { style: "margin-top:20px; margin-bottom:10px;" }, "Navigation:"),
      m("ul", [
        m(
          "li",
          m.trust(
            "Use the <strong>up</strong> and <strong>down</strong> arrow keys to navigate between articles.<br><br>"
          )
        ),
        m(
          "li",
          m.trust(
            "Use the <strong>left</strong> and <strong>right</strong> arrow keys to switch between categories.<br><br>"
          )
        ),
        m(
          "li",
          m.trust(
            "Press <strong>Enter</strong> to view the content of an article.<br><br>"
          )
        ),
        m(
          "li",
          {
            oncreate: (vnode) => {
              if (!status.notKaiOS) vnode.dom.style.display = "none";
            },
          },
          m.trust("Use <strong>Alt</strong> to access various options.")
        ),

        m(
          "li",
          {
            oncreate: (vnode) => {
              if (status.notKaiOS) vnode.dom.style.display = "none";
            },
          },
          m.trust("Use <strong>#</strong> Volume")
        ),

        m(
          "li",
          {
            oncreate: (vnode) => {
              if (status.notKaiOS) vnode.dom.style.display = "none";
            },
          },
          m.trust("Use <strong>*</strong> Audioplayer<br><br>")
        ),

        m("li", "Version: " + status.version),
      ])
    );
  },
};

var privacy_policy = {
  view: function () {
    return m(
      "div",
      {
        id: "privacy_policy",
        class: "page scrollable",
        oncreate: () => {
          bottom_bar("", "", "");
        },
      },
      [
        m("h1", "Privacy Policy for Feedolin"),
        m(
          "p",
          "Feedolin is committed to protecting your privacy. This policy explains how data is handled within the app."
        ),

        m("h2", "Data Storage and Collection"),
        m("p", [
          "All data related to your RSS/Atom feeds and Mastodon account is stored ",
          m("strong", "locally"),
          " in your device’s browser. Feedolin does ",
          m("strong", "not"),
          " collect or store any data on external servers. The following information is stored locally:",
        ]),
        m("ul", [
          m("li", "Your subscribed RSS/Atom feeds and podcasts."),
          m("li", "OPML files you upload or manage."),
          m("li", "Your Mastodon account information and related data."),
        ]),
        m("p", "No server-side data storage or collection is performed."),

        m("h2", "KaiOS Users"),
        m("p", [
          "If you are using Feedolin on a KaiOS device, the app uses ",
          m("strong", "KaiOS Ads"),
          ", which may collect data related to your usage. The data collected by KaiOS Ads is subject to the ",
          m(
            "a",
            {
              href: "https://www.kaiostech.com/privacy-policy/",
              target: "_blank",
              rel: "noopener noreferrer",
            },
            "KaiOS privacy policy"
          ),
          ".",
        ]),
        m("p", [
          "For users on all other platforms, ",
          m("strong", "no ads"),
          " are used, and no external data collection occurs.",
        ]),

        m("h2", "External Sources Responsibility"),
        m("p", [
          "Feedolin enables you to add feeds and connect to external sources such as RSS/Atom feeds, podcasts, and Mastodon accounts. You are ",
          m("strong", "solely responsible"),
          " for the sources you choose to trust and subscribe to. Feedolin does not verify or control the content or data provided by these external sources.",
        ]),

        m("h2", "Third-Party Services"),
        m(
          "p",
          "Feedolin integrates with third-party services such as Mastodon. These services have their own privacy policies, and you should review them to understand how your data is handled."
        ),

        m("h2", "Policy Updates"),
        m(
          "p",
          "This Privacy Policy may be updated periodically. Any changes will be communicated through updates to the app."
        ),

        m(
          "p",
          "By using Feedolin, you acknowledge and agree to this Privacy Policy."
        ),
      ]
    );
  },
};

var settingsView = {
  view: function () {
    return m(
      "div",
      {
        class: "flex justify-content-center page",
        id: "settings-page",
        oncreate: () => {
          if (!status.notKaiOS) {
            status.local_opml = [];
            let cbb = (data) => {
              status.local_opml.push(data);
            };
            list_files("opml", cbb);
          }
          bottom_bar("", "<img src='assets/icons/select.svg'>", "");
          if (status.notKaiOS) bottom_bar("", "", "");

          document.querySelectorAll(".item").forEach((e, k) => {
            e.setAttribute("tabindex", k);
          });

          if (status.notKaiOS)
            top_bar("<img src='assets/icons/back.svg'>", "", "");
          if (status.notKaiOS) bottom_bar("", "", "");
        },
      },
      [
        m(
          "div",
          {
            class: "item input-parent  flex",
            oncreate: () => {
              scrollToTop();
            },
          },
          [
            m(
              "label",
              {
                for: "url-opml",
              },
              "OPML"
            ),
            m("input", {
              id: "url-opml",
              placeholder: "",
              value: settings.opml_url || "",
              type: "url",
            }),
          ]
        ),
        m(
          "button",
          {
            class: "item",
            onclick: () => {
              if (!settings.opml_local_filename) {
                let cb = (data) => {
                  const reader = new FileReader();

                  reader.onload = () => {
                    const downloadListData = generateDownloadList(
                      reader.result
                    );
                    if (downloadListData.error) {
                      side_toaster("OPML file not valid", 4000);
                    } else {
                      settings.opml_local = reader.result;
                      settings.opml_local_filename = data.filename;
                      localforage.setItem("settings", settings).then(() => {
                        side_toaster("OPML file added", 4000);
                      });
                    }
                  };

                  reader.onerror = () => {
                    side_toaster("OPML file not valid", 4000);
                  };

                  reader.readAsText(data.blob);
                };
                if (status.notKaiOS) {
                  pick_file(cb);
                } else {
                  status.local_opml.length > 0
                    ? m.route.set("/localOPML")
                    : side_toaster("no OPML file found", 3000);
                }
              } else {
                settings.opml_local = "";
                settings.opml_local_filename = "";

                localforage.setItem("settings", settings).then(() => {
                  side_toaster("OPML file removed", 4000);
                  m.redraw();
                });
              }
            },
          },
          !settings.opml_local_filename
            ? "Upload OPML file"
            : "Remove OPML file"
        ),

        m("div", settings.opml_local_filename),

        m("div", { class: "seperation" }),
        status.notKaiOS
          ? m(
              "div",
              {
                class: "item input-parent flex ",
              },
              [
                m(
                  "label",
                  {
                    for: "url-proxy",
                  },
                  "PROXY"
                ),
                m("input", {
                  id: "url-proxy",
                  placeholder: "",
                  value: settings.proxy_url || "",
                  type: "url",
                }),
              ]
            )
          : null,
        m("div", { class: "seperation" }),

        m(
          "h2",
          { class: "flex justify-content-spacearound" },
          "Mastodon Account"
        ),

        status.mastodon_logged
          ? m(
              "div",
              {
                id: "account_info",
                class: "item",
              },
              `You have successfully logged in as ${status.mastodon_logged} and the data is being loaded from server ${settings.mastodon_server_url}.`
            )
          : null,

        status.mastodon_logged
          ? m(
              "button",
              {
                class: "item",
                onclick: function () {
                  settings.mastodon_server_url = "";
                  settings.mastodon_token = "";
                  localforage.setItem("settings", settings);
                  status.mastodon_logged = "";
                  m.route.set("/settingsView");
                },
              },
              "Disconnect"
            )
          : null,

        status.mastodon_logged
          ? null
          : m(
              "div",
              {
                class: "item input-parent flex justify-content-spacearound",
              },
              [
                m(
                  "label",
                  {
                    for: "mastodon-server-url",
                  },
                  "URL"
                ),
                m("input", {
                  id: "mastodon-server-url",
                  placeholder: "Server URL",
                  value: settings.mastodon_server_url,
                }),
              ]
            ),

        status.mastodon_logged
          ? null
          : m(
              "button",
              {
                class: "item",
                onclick: function () {
                  localforage.setItem("settings", settings);

                  settings.mastodon_server_url = document.getElementById(
                    "mastodon-server-url"
                  ).value;

                  let url =
                    settings.mastodon_server_url +
                    "/oauth/authorize?client_id=" +
                    process.env.clientId +
                    "&scope=read&redirect_uri=" +
                    process.env.redirect +
                    "&response_type=code";
                  window.open(url);
                },
              },
              "Connect"
            ),

        m("div", { class: "seperation" }),
        m(
          "div",
          {
            class: "item input-parent",
          },
          [
            m("label", { for: "sleep-timer" }, "Sleep timer"),
            m(
              "select",
              {
                name: "sleep-timer",
                class: "select-box",
                id: "sleep-timer",
                value: settings.sleepTimer,
                onchange: (e) => {
                  settings.sleepTimer = e.target.value;
                  m.redraw();
                },
              },
              [
                m("option", { value: "1" }, "1"),
                m("option", { value: "5" }, "5"),
                m("option", { value: "10" }, "10"),
                m("option", { value: "20" }, "20"),
                m("option", { value: "30" }, "30"),
                m("option", { value: "30" }, "40"),
                m("option", { value: "30" }, "50"),
                m("option", { value: "30" }, "60"),
              ]
            ),
          ]
        ),

        m(
          "button",
          {
            class: "item",
            id: "button-save-settings",
            onclick: function () {
              if (
                document.getElementById("url-opml").value != "" &&
                !validate_url(document.getElementById("url-opml").value)
              )
                side_toaster("URL not valid", 4000);

              settings.opml_url = document.getElementById("url-opml").value;
              if (status.notKaiOS)
                settings.proxy_url = document.getElementById("url-proxy").value;

              let sleepTimerInput =
                document.getElementById("sleep-timer").value;
              if (
                sleepTimerInput &&
                !isNaN(sleepTimerInput) &&
                Number(sleepTimerInput) > 0
              ) {
                settings.sleepTimer = parseInt(sleepTimerInput, 10);
              } else {
                settings.sleepTimer = "";
              }

              status.mastodon_logged
                ? null
                : (settings.mastodon_server_url = document.getElementById(
                    "mastodon-server-url"
                  ).value);

              localforage
                .setItem("settings", settings)
                .then(function () {
                  side_toaster("settings saved", 2000);
                })
                .catch(function (err) {
                  alert(err);
                });
            },
          },
          "save settings"
        ),
      ]
    );
  },
};

var subscriptionsView = {
  view: function () {
    return m(
      "div",
      {
        id: "subscriptionsView",
        class: "flex page",
        oncreate: () => {
          top_bar("", "", "");

          console.log(downloadList);

          if (status.notKaiOS)
            top_bar("<img src='assets/icons/back.svg'>", "", "");

          bottom_bar(
            "",
            "<img class='not-desktop' src='assets/icons/select.svg'>",
            ""
          );

          if (status.notKaiOS) bottom_bar("", "", "");
        },
      },
      [
        m(
          "div",
          m.trust(
            "<strong>Subscriptions</strong><br>The red could not be loaded.<br><br>"
          )
        ),
        downloadList.map((e) => {
          return m(
            "article",
            {
              class: "item",
              oncreate: (vnode) => {
                setTabindex();
                if (e.error) vnode.dom.classList.add("error");
              },
            },
            [
              m("span", { class: "type-indicator" }, e.channel),
              m("H2", e.title),
            ]
          );
        }),
      ]
    );
  },
};

m.route(root, "/intro", {
  "/article": article,
  "/settingsView": settingsView,
  "/intro": intro,
  "/start": start,
  "/options": options,
  "/about": about,
  "/privacy_policy": privacy_policy,
  "/localOPML": localOPML,
  "/AudioPlayerView": AudioPlayerView,
  "/VideoPlayerView": VideoPlayerView,
  "/YouTubePlayerView": YouTubePlayerView,
  "/subscriptionsView": subscriptionsView,
});

function scrollToCenter() {
  const activeElement = document.activeElement;
  if (!activeElement) return;

  const rect = activeElement.getBoundingClientRect();
  let elY = rect.top + rect.height / 2;

  let scrollContainer = activeElement.parentNode;

  // Find the first scrollable parent
  while (scrollContainer) {
    if (
      scrollContainer.scrollHeight > scrollContainer.clientHeight ||
      scrollContainer.scrollWidth > scrollContainer.clientWidth
    ) {
      // Calculate the element's offset relative to the scrollable parent
      const containerRect = scrollContainer.getBoundingClientRect();
      elY = rect.top - containerRect.top + rect.height / 2;
      break;
    }
    scrollContainer = scrollContainer.parentNode;
  }

  if (scrollContainer) {
    scrollContainer.scrollBy({
      left: 0,
      top: elY - scrollContainer.clientHeight / 2,
      behavior: "smooth",
    });
  } else {
    // If no scrollable parent is found, scroll the document body
    document.body.scrollBy({
      left: 0,
      top: elY - window.innerHeight / 2,
      behavior: "smooth",
    });
  }
}

let scrollToTop = () => {
  document.body.scrollTo({
    left: 0,
    top: 0,
    behavior: "smooth",
  });

  document.documentElement.scrollTo({
    left: 0,
    top: 0,
    behavior: "smooth",
  });
};

document.addEventListener("DOMContentLoaded", function (e) {
  /////////////////
  ///NAVIGATION
  /////////////////

  let nav = function (move) {
    if (
      document.activeElement.nodeName == "SELECT" ||
      document.activeElement.type == "date" ||
      document.activeElement.type == "time" ||
      status.window_status == "volume"
    )
      return false;

    if (document.activeElement.classList.contains("scroll")) {
      const scrollableElement = document.querySelector(".scroll");
      if (move == 1) {
        scrollableElement.scrollBy({ left: 0, top: 10 });
      } else {
        scrollableElement.scrollBy({ left: 0, top: -10 });
      }
    }

    const currentIndex = document.activeElement.tabIndex;
    let next = currentIndex + move;
    let items = 0;

    items = document.getElementById("app").querySelectorAll(".item");

    if (document.activeElement.parentNode.classList.contains("input-parent")) {
      document.activeElement.parentNode.focus();
      return true;
    }

    let targetElement = 0;

    if (next <= items.length) {
      targetElement = items[next];
      targetElement.focus();
    }

    if (next >= items.length) {
      targetElement = items[0];
      targetElement.focus();
    }

    scrollToCenter();
  };

  //detect swiping to fire animation

  let swiper = () => {
    let startX = 0;
    let maxSwipeDistance = 300; // Maximum swipe distance for full fade-out

    document.addEventListener(
      "touchstart",
      function (e) {
        startX = e.touches[0].pageX;
        document.querySelector("body").style.opacity = 1;
      },
      false
    );

    document.addEventListener(
      "touchmove",
      function (e) {
        let diffX = Math.abs(e.touches[0].pageX - startX);

        // Calculate the inverted opacity based on swipe distance
        let opacity = 1 - Math.min(diffX / maxSwipeDistance, 1);

        let r = m.route.get();
        if (r.startsWith("/article"))
          document.querySelector("body").style.opacity = opacity;
      },
      false
    );

    document.addEventListener(
      "touchend",
      function (e) {
        // Reset opacity to 1 when the swipe ends
        document.querySelector("body").style.opacity = 1;
      },
      false
    );
  };

  if (status.notKaiOS) swiper();

  // Add click listeners to simulate key events
  document
    .querySelector("div.button-left")
    .addEventListener("click", function (event) {
      simulateKeyPress("SoftLeft");
    });

  document
    .querySelector("div.button-right")
    .addEventListener("click", function (event) {
      simulateKeyPress("SoftRight");
    });

  document
    .querySelector("div.button-center")
    .addEventListener("click", function (event) {
      simulateKeyPress("Enter");
    });

  //top bar

  document
    .querySelector("#top-bar div div.button-left")
    .addEventListener("click", function (event) {
      simulateKeyPress("Backspace");
    });

  document
    .querySelector("#top-bar div div.button-right")
    .addEventListener("click", function (event) {
      simulateKeyPress("*");
    });

  // Function to simulate key press events
  function simulateKeyPress(k) {
    shortpress_action({ key: k });
  }

  let isKeyDownHandled = false;

  document.addEventListener("keydown", function (event) {
    if (!isKeyDownHandled) {
      handleKeyDown(event); // Your keydown handler

      isKeyDownHandled = true;

      // Reset the flag after some time if needed, or based on your conditions
      setTimeout(() => {
        isKeyDownHandled = false;
      }, 300); // Optional timeout to reset the flag after a short delay
    }
  });

  let isKeyUpHandled = false;

  document.addEventListener("keyup", function (event) {
    if (!isKeyUpHandled) {
      handleKeyUp(event); // Your keydown handler

      isKeyUpHandled = true;

      // Reset the flag after some time if needed, or based on your conditions
      setTimeout(() => {
        isKeyUpHandled = false;
      }, 300); // Optional timeout to reset the flag after a short delay
    }
  });
  if (status.notKaiOS) {
    document.addEventListener("swiped", function (e) {
      let r = m.route.get();

      let dir = e.detail.dir;

      if (dir == "right") {
        if (r.startsWith("/start")) {
          counter--;
          if (counter < 1) counter = channels.length - 1;

          channel_filter = channels[counter];
          m.redraw();
          const currentParams = m.route.param(); // Get the current parameters
          currentParams.index = 0; // Modify the `index` parameter

          m.route.set("/start", currentParams); // Update the route with the new parameters
        }
      }
      if (dir == "left") {
        if (r.startsWith("/start")) {
          counter++;
          if (counter > channels.length - 1) counter = 0;

          channel_filter = channels[counter];
          m.redraw();
          const currentParams = m.route.param(); // Get the current parameters
          currentParams.index = 0; // Modify the `index` parameter

          m.route.set("/start", currentParams); // Update the route with the new parameters
        }
      }
    });
  }

  // ////////////////////////////
  // //KEYPAD HANDLER////////////
  // ////////////////////////////

  let longpress = false;
  const longpress_timespan = 2000;
  let timeout;

  function repeat_action(param) {
    switch (param.key) {
    }
  }

  //////////////
  ////LONGPRESS
  /////////////

  function longpress_action(param) {
    switch (param.key) {
      case "Backspace":
        window.close();
        break;
    }
  }

  // /////////////
  // //SHORTPRESS
  // ////////////

  function shortpress_action(param) {
    let r = m.route.get();

    switch (param.key) {
      case "ArrowRight":
        if (r.startsWith("/start")) {
          counter++;

          if (counter > channels.length - 1) counter = 0;

          channel_filter = channels[counter];
          m.redraw();
          const currentParams = m.route.param(); // Get the current parameters
          currentParams.index = 0; // Modify the `index` parameter
          m.route.set("/start", currentParams); // Update the route with the new parameters

          setTimeout(() => {
            document.querySelectorAll("article.item")[0].focus();
            scrollToCenter();
          }, 500);
        }
        break;

      case "ArrowLeft":
        if (r.startsWith("/start")) {
          counter--;

          if (counter < 0) counter = channels.length - 1;

          channel_filter = channels[counter];

          m.redraw();
          // Update the route with the new parameter, preserving the rest
          const currentParams = m.route.param(); // Get the current parameters
          currentParams.index = 0; // Modify the `index` parameter
          m.route.set("/start", currentParams); // Update the route with the new parameters
          setTimeout(() => {
            document.querySelectorAll("article.item")[0].focus();

            scrollToCenter();
          }, 500);
        }
        break;
      case "ArrowUp":
        nav(-1);

        if (status.window_status == "volume") {
          navigator.volumeManager.requestVolumeUp();
          status.window_status = "volume";

          setTimeout(() => {
            status.window_status = "";
          }, 2000);
        }
        break;
      case "ArrowDown":
        nav(+1);

        if (status.window_status == "volume") {
          navigator.volumeManager.requestVolumeDown();
          status.window_status = "volume";

          setTimeout(() => {
            status.window_status = "";
          }, 2000);
        }

        break;

      case "SoftRight":
      case "Alt":
        if (r.startsWith("/start")) {
          m.route.set("/options");
        }

        if (r.startsWith("/article")) {
          if (current_article.type == "audio")
            m.route.set(
              `/AudioPlayerView?url=${encodeURIComponent(
                current_article.enclosure["@_url"]
              )}&id=${current_article.id}`
            );

          if (current_article.type == "video")
            m.route.set(
              `/VideoPlayerView?url=${encodeURIComponent(
                current_article.enclosure["@_url"]
              )}`
            );

          if (current_article.type == "youtube")
            m.route.set(
              `/YouTubePlayerView?videoId=${encodeURIComponent(
                current_article.youtubeid
              )}`
            );
        }
        break;

      case "SoftLeft":
      case "Control":
        if (r.startsWith("/start")) {
          reload_data();
        }

        if (r.startsWith("/article")) {
          window.open(current_article.url);
        }

        if (r.startsWith("/AudioPlayerView")) {
          status.sleepTimer
            ? stopTimer()
            : startTimer(settings.sleepTimer * 60 * 1000);
        }

        break;

      case "Enter":
        if (document.activeElement.classList.contains("input-parent")) {
          document.activeElement.children[0].focus();
        }
        break;

      case "*":
        m.route.set(`/AudioPlayerView`);
        break;

      case "#":
        volume_control();
        break;

      case "Backspace":
        if (r.startsWith("/start")) {
          window.close();
        }
        if (r.startsWith("/article")) {
          const index = m.route.param("index");
          m.route.set("/start?index=" + index);
        }

        if (r.startsWith("/YouTubePlayerView")) {
          const index = m.route.param("index");
          m.route.set("/start?index=" + index);
        }

        if (r.startsWith("/localOPML")) {
          history.back();
        }

        if (r.startsWith("/index")) {
          m.route.set("/start?index=0");
        }

        if (r.startsWith("/subscriptionsView")) {
          m.route.set("/options");
        }

        if (r.startsWith("/about")) {
          m.route.set("/options");
        }

        if (r.startsWith("/privacy_policy")) {
          m.route.set("/options");
        }

        if (r.startsWith("/options")) {
          m.route.set("/start?index=0");
        }

        if (r.startsWith("/settingsView")) {
          if (document.activeElement.tagName == "INPUT") return false;
          m.route.set("/options");
        }

        if (r.startsWith("/Video")) {
          history.back();
        }

        if (r.startsWith("/Audio")) history.back();

        break;
    }
  }

  // ///////////////////////////////
  // //shortpress / longpress logic
  // //////////////////////////////

  function handleKeyDown(evt) {
    if (evt.key == "Backspace" && document.activeElement.tagName != "INPUT") {
      evt.preventDefault();
    }

    if (evt.key === "EndCall") {
      evt.preventDefault();
      window.close();
    }
    if (!evt.repeat) {
      longpress = false;
      timeout = setTimeout(() => {
        longpress = true;
        longpress_action(evt);
      }, longpress_timespan);
    }

    if (evt.repeat) {
      if (evt.key == "Backspace") evt.preventDefault();

      if (evt.key == "Backspace") longpress = false;

      repeat_action(evt);
    }
  }

  function handleKeyUp(evt) {
    if (evt.key == "Backspace") evt.preventDefault();

    if (status.visibility === false) return false;

    clearTimeout(timeout);
    if (!longpress) {
      shortpress_action(evt);
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && settings.last_update) {
      status.visibility = true;
      let dif = new Date() / 1000 - settings.last_update / 1000;
      if (dif > settings.cache_time) {
        side_toaster("load new content", 4000);
        start_loading();
      }
    } else {
      status.visibility = false;
    }
  });
});

window.addEventListener("online", () => {
  status.deviceOnline = true;
});
window.addEventListener("offline", () => {
  status.deviceOnline = false;
});

window.addEventListener("beforeunload", (event) => {
  localStorage.setItem("last_channel_filter", channel_filter);
  const entries = window.performance.getEntriesByType("navigation");

  // For older browsers (fallback)
  const navigationType = window.performance.navigation
    ? window.performance.navigation.type
    : null;

  // Detect if the page was reloaded
  const isReload =
    (entries.length && entries[0].type === "reload") || // Modern check
    navigationType === 1; // Fallback for older browsers: 1 means reload

  if (isReload) {
    // Prevent the reload or display a confirmation dialog
    event.preventDefault();

    side_toaster("load new content", 4000);
    start_loading();

    m.route.set("/intro");
    event.returnValue = "Are you sure you want to leave the page?";
  }
});

//KaiOS3 handel mastodon oauth

try {
  sw_channel.addEventListener("message", (event) => {
    let result = event.data.oauth_success;

    if (result) {
      var myHeaders = new Headers();
      myHeaders.append("Content-Type", "application/x-www-form-urlencoded");

      var urlencoded = new URLSearchParams();
      urlencoded.append("code", result);
      urlencoded.append("scope", "read");

      urlencoded.append("grant_type", "authorization_code");
      urlencoded.append("redirect_uri", process.env.redirect);
      urlencoded.append("client_id", process.env.clientId);
      urlencoded.append("client_secret", process.env.clientSecret);

      var requestOptions = {
        method: "POST",
        headers: myHeaders,
        body: urlencoded,
        redirect: "follow",
      };

      fetch(settings.mastodon_server_url + "/oauth/token", requestOptions)
        .then((response) => response.json()) // Parse the JSON once
        .then((data) => {
          settings.mastodon_token = data.access_token; // Access the token
          localforage.setItem("settings", settings);
          m.route.set("/start?index=0");

          side_toaster("Successfully connected", 10000);
        })
        .catch((error) => {
          console.error("Error:", error);
          side_toaster("Connection failed");
        });
    }
  });
} catch (e) {}

//worker sleep mode
if (navigator.mozAlarms) {
  navigator.mozSetMessageHandler("alarm", function (mozAlarm) {
    globalAudioElement.pause();
    status.sleepTimer = false;
  });
}

let worker;

try {
  worker = new Worker(new URL("./worker.js", import.meta.url));
} catch (e) {
  console.log(e);
}

function startTimer(timerDuration) {
  //KaiOS2
  if (navigator.mozAlarms) {
    let sleepDuration = settings.sleepTimer * 60 * 1000; // Convert minutes to milliseconds
    let targetTime = new Date(Date.now() + sleepDuration); // Add duration to current time

    var request = navigator.mozAlarms.add(targetTime, "honorTimezone");

    request.onsuccess = function () {
      status.alarmId = this.result;
    };
  }

  status.sleepTimer = true;
  side_toaster("sleep mode on", 3000);

  worker.postMessage({ action: "start", duration: timerDuration });
}

function stopTimer() {
  if (navigator.mozAlarms) {
    navigator.mozAlarms.remove(status.alarmId);
  }
  status.sleepTimer = false;

  side_toaster("sleep mode off", 3000);
  worker.postMessage({ action: "stop" });
}

worker.onmessage = function (event) {
  if (event.data.action === "stop") {
    globalAudioElement.pause();
    status.sleepTimer = false;
  }
};
