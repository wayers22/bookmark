window.gibinit = function() {
    if (typeof window.gibSettings != 'undefined') {
      console.warn('GIB Already exists... Exiting');
      return false;
    }
  
    function detectRetailer() {
      var host = location.host || location.hostname;
      if (!!host.match(/target/ig)) return 'target';
      return null; // No other retailers supported
    }
  
    function targetProductMeta() {
      try {
        var meta = document.querySelector('button.add-to-cart').getAttribute('data-gtmdata');
        var product = JSON.parse(meta);
        return product;
      } catch(err) {
        console.warn(err);
        return null;
      }
    }
  
    function detectUPC() {
      if (window.gibRetailer == 'target') {
        var upcMatches = location.pathname.match(/(A-\d{8})/);
        var onlyUpc = location.pathname.match(/(\d{8})/);
        if (upcMatches) {
          var upc1 = upcMatches[0].split('-')[1];
          var upc2 = onlyUpc[0];
          if (upc1 == upc2) return upc1;
        }
      }
      return null;
    }
  
    function detectProductName() {
      if (window.gibRetailer == 'target') {
        var productHeading = document.querySelector('h1');
        if (!productHeading) return 'UNKNOWN PRODUCT';
        return productHeading.textContent;
      }
      return '';
    }
  
    function target_addToCart(DEBUG_NODE, UPC) {
      var cartUrl = 'https://carts.target.com/web_checkouts/v1/cart_items?field_groups=CART%2CCART_ITEMS%2CSUMMARY&key=feaf228eb2777fd3eee0fd5192ae7107d6224b39';
      var cart = {"cart_type":"REGULAR","channel_id":"10","shopping_context":"DIGITAL","cart_item":{"tcin":UPC,"quantity":1,"item_channel_id":"10"},"fulfillment":{"fulfillment_test_mode":"grocery_opu_team_member_test"}};
      
      DEBUG_NODE.innerText = 'Attempting Cart Add...';
  
      fetch(cartUrl, { method: 'POST', mode: 'cors', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cart) })
      .then(function(response) {
        window.gibAttempts++;
        if (response.status >= 200 && response.status < 400) return window.location.replace('https://www.target.com/co-review?precheckout=true');
        else if (response.status == 401) return 'AUTH';
        return false;
      }).then(function(response) {
        if (!response) {
          DEBUG_NODE.innerText = 'Status: FAILED... Attempt #' + window.gibAttempts;
          return false;
        }
  
        if (response == 'AUTH') {
          DEBUG_NODE.innerText = 'CRITICAL ERROR... Refresh this page and reactivate product watcher to continue...';
          window.gibWatcherDisable();
          window.gibSoundTrigger(4, true);
          return false;
        }
  
        if (window.gibSettings.alerts) {
          window.gibWatcherDisable();
          DEBUG_NODE.innerText = 'THIS PRODUCT IS IN YOUR CART!! CLICK CONTINUE!!';
          document.getElementById('gib--continue').style.display = 'block';
          document.getElementById('gib--settings').style.display = 'none';
          window.gibSoundTrigger(-1);
        } else {
          window.gibSoundTrigger(0, true);
          window.gibWatcherDisable();
          window.location.replace('https://www.target.com/co-review?precheckout=true');
        }
      });
    }
  
    function loadSound() {
      var request = new XMLHttpRequest();
      request.open('GET', 'https://flukeout.github.io/simple-sounds/sounds/dead.wav', true);
      request.responseType = 'arraybuffer';
      request.onload = function() {
        window.gibSoundContext.decodeAudioData(request.response, function(nb) {
          window.gibSoundBuffer = nb;
          window.gibSoundLoaded = true;
          console.log('Gib sound effect loaded');
          window.gibSoundTrigger();
        });
      };
      request.send();
    }
  
    // -1 = loop until cancelled
    //  0 || undefined = trigger once
    //  1+ = how many seconds
    function triggerSound(duration, override) {
      if (typeof override == 'undefined') override = false;
      if (typeof duration == 'undefined') duration = 0;
      if (!window.gibSoundLoaded) return !!console.warn('Sounds not loaded');
      if (!window.gibSettings.alerts && !override) return !!console.warn('Alerts not enabled');
      if (window.gibSoundLoopSource) return !!console.warn('Sound already in progress');
  
      var source = window.gibSoundContext.createBufferSource();
      source.buffer = window.gibSoundBuffer;
      var volume = window.gibSoundContext.createGain();
      volume.gain.value = 1;
      volume.connect(window.gibSoundContext.destination);
      source.connect(volume);
  
      if (duration == -1 || duration > 0) {
        source.loop = true;
        window.gibSoundLoopSource = source;
  
        if (duration > 0) {
          setTimeout(window.gibStopSound, (duration * 1000));
        }
      }
  
      source.start(0);
    }
  
    function stopSound() {
      if (!window.gibSoundLoaded) return !!console.warn('Sounds not loaded');
      if (!window.gibSoundLoopSource) return !!console.warn('Sound not in progress');
  
      try {
        window.gibSoundLoopSource.stop();
        window.gibSoundLoopSource = null;
      } catch (err) {}
    }
  
    function startWatcher(GIB, DEBUG_NODE) {
      if (!window.gibSupportedSites.includes(window.gibRetailer)) {
        DEBUG_NODE.innerText = 'Retailer not supported! This tool does not currently support ' + window.gibRetailer + '. Follow @pixxlated for the latest supported retailers.';
        window.gibWatcherDisable();
        window.gibSoundTrigger(5, true);
        return false;
      }
  
      if (!GIB.PRODUCT_UPC || GIB.PRODUCT_UPC.length == 0) {
        DEBUG_NODE.innerText = 'CRITICAL ERROR, CANNOT DETERMINE PRODUCT UPC. WATCHER FAILED.';
        window.gibWatcherDisable();
        window.gibSoundTrigger(5, true);
        return false;
      }
  
      DEBUG_NODE.innerText = 'Starting Watcher';
  
      clearInterval(window.gibTimerId);
      window.gibSettings.enabled = true;
      window.gibAttemptSecondsLeft = GIB.refreshSeconds;
  
      setTimeout(function() {
        GIB.addToCart(DEBUG_NODE, GIB.PRODUCT_UPC);
  
        window.gibTimerId = setInterval(function() {
          if (!window.gibSettings.enabled) {
            console.log('GIB Disabled...');
            return;
          }
  
          window.gibAttemptSecondsLeft--;
  
          if (window.gibRetryCountdownNow <= 0) {
            DEBUG_NODE.innerText = 'Attempt #' + window.gibAttempts + '... Retrying in ' + window.gibAttemptSecondsLeft + ' second(s)...';
          }
  
          if (window.gibAttemptSecondsLeft <= 0) {
            window.gibAttemptSecondsLeft = GIB.refreshSeconds;
            GIB.addToCart(DEBUG_NODE, GIB.PRODUCT_UPC);
          }
        }, 350);
      }, 350);
    }
  
    function stopWatcher(DEBUG_NODE) {
      if (DEBUG_NODE) DEBUG_NODE.innerText = 'Stopping Watcher';
      window.gibSettings.enabled = false;
      clearInterval(window.gibTimerId);
      if (DEBUG_NODE) DEBUG_NODE.innerText = 'Watcher DISABLED';
    }
  
    window.gibSupportedSites = ['target'];
    window.gibSoundContext = new AudioContext();
    window.gibSoundLoopSource = null;
    window.gibSoundBuffer = null;
    window.gibSoundLoaded = false;
  
    window.gibAttemptSecondsLeft = 0;
    window.gibRetryCountdownMAX = 2; // minutes
    window.gibRetryCountdownNow = 0;
  
    window.gibRetailer = detectRetailer();
    window.gibAttempts = 0;
    window.gibTimerId = null;
  
    window.gibVerified = -5;
    window.gibSettings = {
      alerts: true,
      enabled: true
    };
  
    var gib = {
      GIB_VERSION: '1',
      PRODUCT_UPC: detectUPC(),
      PRODUCT_TITLE: detectProductName(),
  
      refreshSeconds: window.gibRetailer == 'target' ? 60 : 10,
  
      createElement: function(tag, id, styles) {
        var node = document.createElement(tag);
        if (id) node.id = id;
        if (!styles) return node;
        for (var style in styles) {
          node.style[style] = styles[style];
        }
        return node;
      },
  
      insertStyles: function(styles) {
        var sheet = document.createElement('style');
        sheet.type = 'text/css';
        sheet.innerText = styles;
        document.head.appendChild(sheet);
      },
  
      addToCart: function(DEBUG_NODE, UPC) {
        if (window.gibRetailer == 'target') {
          target_addToCart(DEBUG_NODE, UPC);
        } else {
          DEBUG_NODE.innerText = 'Retailer not supported!';
          window.gibWatcherDisable();
          window.gibSoundTrigger(5, true);
        }
      },
  
      startWatcher: function(DEBUG_NODE) {
        startWatcher(gib, DEBUG_NODE);
      },
  
      stopWatcher: function(DEBUG_NODE) {
        stopWatcher(DEBUG_NODE);
      },
  
      isDebug: function() {
        var isDebug = new URLSearchParams(window.location.search).get('debug');
        return isDebug === 'true';
      }
    };
  
    window.gibStopSound = stopSound;
    window.gibSoundTrigger = triggerSound;
    window.gibWatcherDisable = function() {
      stopWatcher();
    };
  
    window.gibStart = function(debug) {
      window.gibSettings.enabled = true;
      console.warn('GIB Starting... (debug: ' + debug + ')');
      if (debug) document.body.appendChild(gib.createElement('div', 'gib--debug'));
  
      var DEBUG_NODE = document.getElementById('gib--debug');
      if (!DEBUG_NODE) return !!console.warn('NO DEBUG NODE! Impossible');
      DEBUG_NODE.innerText = 'INITIAL CHECKS...';
  
      setTimeout(function() {
        if (!gib.PRODUCT_UPC) {
          DEBUG_NODE.innerText = 'NO VALID UPC FOUND!';
          window.gibSoundTrigger(3, true);
          return false;
        }
  
        if (gib.isDebug()) {
          DEBUG_NODE.style.display = 'block';
          document.getElementById('gib--settings').style.display = 'block';
        }
  
        gib.startWatcher(DEBUG_NODE);
      }, 500);
    };
  
    loadSound();
    window.gibSettings = {};
    window.gib = gib;
    window.gibStart(gib.isDebug());
  };
  
  window.gibinit();
