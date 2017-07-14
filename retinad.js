const _keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

function retinad_encode(input) {
  /*
   *  Base64 encode / decode
   *  http://www.webtoolkit.info/
   */
    var output = "";
    var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
    var i = 0;

    input = retinad_utf8_encode(input);

    while (i < input.length) {

        chr1 = input.charCodeAt(i++);
        chr2 = input.charCodeAt(i++);
        chr3 = input.charCodeAt(i++);

        enc1 = chr1 >> 2;
        enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
        enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
        enc4 = chr3 & 63;

        if (isNaN(chr2)) {
            enc3 = enc4 = 64;
        } else if (isNaN(chr3)) {
            enc4 = 64;
        }

        output = output +
            _keyStr.charAt(enc1) + _keyStr.charAt(enc2) +
            _keyStr.charAt(enc3) + _keyStr.charAt(enc4);
    }
    return output;
}

function retinad_utf8_encode(string) {
    string = string.replace(/\r\n/g,"\n");
    var utftext = "";

    for (var n = 0; n < string.length; n++) {

        var c = string.charCodeAt(n);

        if (c < 128) {
            utftext += String.fromCharCode(c);
        }
        else if((c > 127) && (c < 2048)) {
            utftext += String.fromCharCode((c >> 6) | 192);
            utftext += String.fromCharCode((c & 63) | 128);
        }
        else {
            utftext += String.fromCharCode((c >> 12) | 224);
            utftext += String.fromCharCode(((c >> 6) & 63) | 128);
            utftext += String.fromCharCode((c & 63) | 128);
        }

    }
    return utftext;
}

function retinad_extend(obj /*, arg1, arg2, ... */) {
    var arg, i, k;
    for (i = 1; i < arguments.length; i++) {
        arg = arguments[i];
        for (k in arg) {
            if (arg.hasOwnProperty(k)) {
                obj[k] = arg[k];
            }
        }
    }
    return obj;
}

function retinad_santitizeBase64(base64) {
    return base64.replace('+','-').replace('/','_').replace('=','.');
}

// Function to round to the nearest specified decimal
Number.prototype.round = function (places) {
    return +(Math.round(this + "e+" + places)  + "e-" + places);
}

// Assume that forward vector is U=0.5 V=0.5 and right vector U=1 V=0.5, Up is V=1
function retinad_convertVector3ToUV(vector){
    var u, v;
    // Check if y value is near 1 or -1 and force the value as it will generate an NaN from asin
    if (vector.y.round(5) == 1) {
        v = 1.0;
    }
    else if (vector.y.round(5) == -1) {
        v = 0.0;
    }
    else {
        v =  (Math.asin(vector.y) / Math.PI) + 0.5;
    }
    u =  0.5 + (Math.atan2(vector.x, -vector.z) / (2*Math.PI));
    return {
        u: u,
        v: v
    }
}

window.retinad_convertVector3ToUV = retinad_convertVector3ToUV;

var retinad_defaults = {
    appId:'',
    accountKey:''
};

var retinad = new function() {

  this.kinesis = null;

  this.settings = null;
  this.partitionKey = (Math.random() + 1).toString(36).substring(7); // The partition key for kinesis, need to be random for proper shard load balancing
  this.session = null; // The session id, will be retrieve by the call to the Retinad REST API
  this.context = null;
  this.playString = 'start';
  this.didEnd = false;
  this.frames = [];
  this.isPlaying = false;
  this.waitingQueue = [];

  this.connect = function(options) {
    const AWS = require('aws-sdk');
    this.kinesis = new AWS.Kinesis({region: 'us-west-2',
        accessKeyId: 'AKIAJCTJLO56FB4NBOQQ',
        secretAccessKey: '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',
        apiVersion: '2013-12-02'});

    if(!!navigator.doNotTrack)
      return;
    this.settings = retinad_extend({}, retinad_defaults, options || {});
    var webglInfo =
    {
        "version" : "not found",
        "vendor" : "not found",
        "renderer" : "not found",
        "unmaskedVendor" : "not found",
        "unmaskedRenderer" : "not found"
    };

    //Look for WebGL information
    if (!!window.WebGLRenderingContext) {
      var canvas = document.createElement("canvas"),
      names = ["webgl", "experimental-webgl", "moz-webgl", "webkit-3d"],
      canvasContext = false;
      for (var i=0;i<4;i++) {
        try {
            canvasContext = canvas.getcanvasContext(names[i]);
            if (canvasContext && typeof canvasContext.getParameter == "function") {
                // WebGL is enabled
                if (webglInfo.version === "not found")
                  webglInfo.version = canvasContext.getParameter(canvasContext.VERSION);
                if (webglInfo.vendor === "not found")
                  webglInfo.vendor = canvasContext.getParameter(canvasContext.VENDOR);
                if (webglInfo.renderer === "not found")
                  webglInfo.renderer = canvasContext.getParameter(canvasContext.RENDERER);

                var debugInfo = canvasContext.getExtension('WEBGL_debug_renderer_info');
                if (webglInfo.unmaskedVendor === "not found")
                  webglInfo.unmaskedVendor = canvasContext.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                if (webglInfo.unmaskedRenderer === "not found")
                  webglInfo.unmaskedRenderer = canvasContext.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            }
        } catch(e) {}
      }
    };

    // Create a new ClientJS object
    require('clientjs');
    var client = new ClientJS();

    function updateSession(request, myself) {
      return function() {
        if (request.readyState == XMLHttpRequest.DONE ) {
          if (request.status == 200) {
          //Success
          JSON.parse(request.responseText, (key, value) =>{
            if (key == "s")
               myself.setSessionTo(value);
             });
           }
        }
      }
    }

    var request = new XMLHttpRequest();
    request.open('POST', 'https://api.retinad.io/analytics/sessions', true);
    request.setRequestHeader('Content-Type', 'application/json');
    request.setRequestHeader('Retinad-Api-Key','#|:J$#]$7|54"?4>(|Ux91<]]{wTDi');
    request.setRequestHeader('Retinad-Account-Key',this.settings.accountKey);
    request.onreadystatechange = updateSession(request, this);
    request.send(JSON.stringify({
            "a" : this.settings.appId, // The appId from Retinad dashboard
            "d" : {
                "retinad" : {
                    "name" : "videojs-vr-retinad",
                    "version" : "1.0.0"
                },
                "user" : {
                    "fingerprint" : client.getFingerprint().toString()
                },
                "browser" : {
                    "name" : client.getBrowser(),
                    "version" : client.getBrowserVersion(),
                    "userAgent" : client.getUserAgent(),
                    "engine" : {
                        "name" : client.getEngine(),
                        "version" : client.getEngineVersion()
                    }
                },
                "os" : {
                    "name" : client.getOS(),
                    "version" : client.getOSVersion(),
                    "timeZone" : client.getTimeZone(),
                    "language" : client.getLanguage(),
                    "systemLanguage" : client.getSystemLanguage()
                },
                "device" : {
                    "name" : client.getDevice(),
                    "type" : client.getDeviceType(),
                    "vendor" : client.getDeviceVendor(),
                    "mobile" : client.isMobile()
                },
                "cpu" : {
                    "name" : client.getCPU()
                },
                "screen" : {
                    "print" : client.getScreenPrint(),
                    "colorDepth" : client.getColorDepth(),
                    "currentResolution" : client.getCurrentResolution(),
                    "availableResolution" : client.getAvailableResolution(),
                    "XDPI" : client.getDeviceXDPI(),
                    "YDPI" : client.getDeviceYDPI()
                },
                "plugin" : {
                    "list" : client.getPlugins()
                },
                "webgl" : webglInfo
            }
        }));
  }

  this.setSessionTo = function(value) {
    this.session = value;
  }

  this.setContextName = function(contextName) {
    if(!!navigator.doNotTrack)
      return;
    this.context = retinad_santitizeBase64(retinad_encode(contextName+" "+ this.settings.appId)); // The context hash, corresponds to the video name + appId
  };

  this.sendData = function(data) {
    if (!this.context)
      return;

    if (!this.session) {
      JSON.parse(JSON.stringify(data), (key, value) =>{
        if (key == "s") {
          if (!value) {
            this.waitingQueue.push(data);
            data = null;
            return;
          }
        }
      });
    }

    if(!data)
      return;

    if (this.session) {
      while (this.waitingQueue.length > 0) {
        var currentData = this.waitingQueue.shift();
        currentData.s = this.session;

        this.send(currentData);
      }
    }

    this.send(data);
  };

  this.send = function(data) {
    var params = {
        Data: JSON.stringify(data), // The json data that we want to send to Retinad servers
        PartitionKey: this.partitionKey, // Random string for better shared distribution
        StreamName: 'rawUncompressed', // Uses the uncompressed method for now, until we implement the Retinad compression algorithm
    };

    this.kinesis.putRecord(params, function(err, result) {
        if (err) {
            console.error(err, err.stack); // an error occurred
        }
    });
  };

  this.collectData = function(currentUV, currentTime) {
    if (!this.isPlaying)
      return;
    this.collectDataWithForcePush(currentUV, currentTime, false)
  };

  this.collectDataWithForcePush = function(currentUV, currentTime, forcePush) {
    if (!this.context)
      return;
    // The number of frame is incremented for each 10th (tenth) of a second (0.1 second), rounded to the nearest integer
    //   So for a time of 1.29 second, it'll be 13 and for a time of 10.53 seconds, it'll be 105
    var frameNumber = Math.round((currentTime*1000)/100);

    // Add a frame to the frames array
    this.frames.push({
        "f": frameNumber,
        "u": currentUV.u,
        "v": currentUV.v
    });

    if (this.frames.length > 1) {
      //If the event before the one we just pushed has the same frame number than the
      //current one, we remove it
      if (this.frames[this.frames.length-2].f === this.frames[this.frames.length-1].f) {
        this.frames.splice(this.frames.length-2, 2, this.frames[this.frames.length-1]);
      }
    }

    // If we have 5 seconds of data, we send it to our servers (this will batch the frames together to reduce network load and bandwidth)
    if (this.frames.length >= 50 || forcePush) {

        // We create a deep copy of the array
        var clonedFrames = JSON.parse(JSON.stringify(this.frames));

        // We delete the frames array (to put new data in it)
        this.frames = [];

        // We create the event with the copied data
        var event = {
          a: this.settings.appId, // The appId from Retinad dashboard
          s: this.session, // The session id retreived from the first call to the Retinad REST API
          e: [
            {
              t: 'uv', // The type of the event
              c: this.context, // The context hash
              f: clonedFrames // Frames to be send
            }
          ]
        };

        this.sendData(event); // This function is declared above
    }
  };

  this.play = function(currentUV, currentTime) {
    this.isPlaying = true;
    var event = {
        a: this.settings.appId, // The appId from Retinad dashboard
        s: this.session, // The session id retreived from the first call to the Retinad REST API
        e: [
            {
                t: 'state', // The type of the event
                n: this.playString, // The value of the state
                d:  (new Date()).toISOString() // Current time
            }
        ]
    };
    this.sendData(event);
    if (this.playString === 'start')
       this.playString = 'resume';

    this.collectDataWithForcePush(currentUV, currentTime); // This function is implemented above
  };

  this.pause = function(currentUV, currentTime) {
    this.isPlaying = false;
    var event = {
        a: this.settings.appId, // The appId from Retinad dashboard
        s: this.session, // The session id retreived from the first call to the Retinad REST API
        e: [
            {
                t: 'state', // The type of the event
                n: 'pause', // The value of the state
                d:  (new Date()).toISOString() // Current time
            }
        ]
    };
    this.collectDataWithForcePush(currentUV, currentTime, true);
    this.sendData(event);
  };

  this.stop = function(currentUV, currentTime) {
    if (this.playString === 'start')
      return;

    this.isPlaying = false;
    this.didEnd = true;
    var event = {
        a: this.settings.appId, // The appId from Retinad dashboard
        s: this.session, // The session id retreived from the first call to the Retinad REST API
        e: [
            {
                t: 'state', // The type of the event
                n: 'end', // The value of the state
                d:  (new Date()).toISOString() // Current time
            }
        ]
    };
    if (!!currentUV && !!currentTime) {
      this.collectDataWithForcePush(currentUV, currentTime, true);
    }
    this.sendData(event);
  };
}

window.retinad = retinad;

window.onbeforeunload = function(e) {
  if (!retinad.didEnd) {
    retinad.stop();
  }
};
