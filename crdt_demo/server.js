var express = require('express');
var app = express();
var ip = require('ip');
var bodyParser = require('body-parser');
var crdt = require('react-crdt')


var clients = [];
var clientResponseDict = {}
var tempState = {};
var pollingQueue = {}
var blockFlagDict = {}
//Local IP
//192.168.178.20

app.use(express.static(__dirname + '/client/src/css'));
// parse application/json
app.use(bodyParser.json());


app.get('/', function (req, res) {
  	console.log('###GET REQUEST received');
  	//Add IP Address to the clients-array if not existing
  	var remIP = req.connection.remoteAddress
  	if (clients.indexOf(remIP) == -1){
      clients.push(remIP)
      console.log("Client "+remIP+" registered");
  	}else{
  		console.log("Client "+remIP+" already exists in Client Array");
      console.log("All Cients: "+ clients)
  	}
  	//Serve Index Site
  	res.sendFile(__dirname + '/client/public/index.html');
});


app.use(express.static(__dirname + '/client/public'));

//Handle new request
app.post('/api', function (req, res){
	console.log('###API Post Request received###');
  sendToAllClientsExcept(req.connection.remoteAddress, req.body);
  res.statusCode = 200;
  res.end();
});


//Register Client for LongPolling
app.get('/api/lp', function(req, res){
  var client = req.connection.remoteAddress
  req.on("close", function(){
    console.log("Client with address "+client+" lost connection.")
  })
  //After the first sending the long polling is initialized
  clientResponseDict[client] = {}
  clientResponseDict[client] = res;
  //Check if key already exists
  if (!pollingQueue.hasOwnProperty(client)){
    //Branch on first long polling Request
    console.log("#Polling: No pollingQueue yet. Launched one.")
    pollingQueue[client] = []
  }else{
    //Check if something was not send yet
    if (pollingQueue[client].length > 0){
      res.end(JSON.stringify(pollingQueue[client].shift()))
      console.log("Something was not sent, sent now to Client... "+client)
      clientResponseDict[client] = {}
    }
  }
});

app.get('/api/initial', function(req,res){
  console.log("Initial to send: "+ JSON.stringify(tempState))
  pollingQueue[req.connection.remoteAddress] = []
  res.end(JSON.stringify(tempState));
});


//Send new TimestampRegister to all Clients
function sendToAllClientsExcept(sender, fileToSend){
    console.log("File to send: "+ JSON.stringify(fileToSend))
    //Client-Features for the server
    if (fileToSend.crdtName in tempState){
      //Use known object if it's already existing
      var tempFile = tempState[fileToSend.crdtName]
    }else{
      //Otherwise create new local crdtObject depending on CRDT Type
      switch (fileToSend.crdtType){
        case "lwwRegister":
         var tempFile = new crdt.OpLwwRegister(fileToSend.crdtName, false, fileToSend.operation.timestamp - 1)
         break
       case "opCounter":
         var tempFile = new crdt.OpCounter(fileToSend.crdtName)
         break
      case "opORSet":
        var tempFile = new crdt.OpORSet(fileToSend.crdtName)
        break
       default:
         console.log("Unexpected datatype")
         break
       }
      tempFile.crdtType = fileToSend.crdtType
    }
    tempState[fileToSend.crdtName] = tempFile.downstream(fileToSend.operation)


    //Send to all
    if (Object.keys(clientResponseDict).length === 0){
      console.log("No Clients registered.")
    }else{
      clients.forEach(function(client){
          if (sender !== client){
            pollingQueue[client].push(fileToSend)

            //In case long polling is currently not available skip sending
            if (Object.keys(clientResponseDict[client]).length === 0){
                console.log("!Error: Can't use Long Polling right now")
            }else{
              //else use long polling for sending
              clientResponseDict[client].end(JSON.stringify(pollingQueue[client].shift()));
              //make the long polling request invalid in the response dictionary
              clientResponseDict[client] = {}
            }
          }else{
            console.log("Sender and Client is both "+sender)
          }
      });
    }
};

//Add Client
function registerClient(clientIP){
    clients.push(clientIP);
};


//Express method for opening the Server
var listener = app.listen(3000, function () {
  console.log("Server is listening on Port "+listener.address().port+" on the IP Address "+ip.address())
  console.log(ip.address()+":"+listener.address().port);
});
