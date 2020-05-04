/* eslint-disable  func-names */
/* eslint-disable  no-console */
/* eslint-disable  no-restricted-syntax */

// IMPORTANT: Please note that this template uses Dispay Directives,
// Display Interface for your skill should be enabled through the Amazon developer console
// See this screenshot - https://alexa.design/enabledisplay

const Alexa = require('ask-sdk-core');
const persistenceAdapter = require('ask-sdk-s3-persistence-adapter');
const https = require('https');

const LoadStockDataInterceptor = {
    async process(handlerInput) {
        const attributesManager = handlerInput.attributesManager;
        const persistedAttributes = await attributesManager.getPersistentAttributes() || {};

        const stocks = persistedAttributes.stocks || [];
        console.log(`Current stocks: ${stocks}`);

        setAttribute(handlerInput, 'stocks', stocks);
        

    }
};



const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === `LaunchRequest` ;
  },
  async handle(handlerInput) {
    const stocks = await getPersistedStockList(handlerInput);
    
    if(stocks.length===0){  
        const welcomeMessage = 'Hello! Welcome to Stock Ninja! I help with your investment portofolio. For example, I can help you check the price of a stock. You can say, check the price of Amazon.' 
        const helpMessage = 'You can say, what is the price of Facebook';
    
    
        return handlerInput.responseBuilder
          .addDelegateDirective({
          name: 'CheckPriceIntent',
          confirmationStatus: 'NONE',
          slots: {}
          })
          .speak(welcomeMessage)
          .reprompt(helpMessage)
          .getResponse();
    }
    let stockOutput = await speakPortfolioWithSSML(stocks, handlerInput); 

    
    //  //Simple SSML
    let speakOutput = `<amazon:emotion name="excited" intensity="medium">  Welcome back Stock Ninja. Now checking your portofolio:<break time="1s"/> ${stockOutput}  </amazon:emotion> ` ;

    
    return handlerInput.responseBuilder.speak(speakOutput).reprompt(suggestAccountLink).getResponse();
    
  },
};

const AddStockToListIntentHandler = {
   
    canHandle(handlerInput){
       console.log("envelope:", handlerInput.requestEnvelope);
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AddStockToListIntent';
    },
    async handle(handlerInput){
      console.log("Inside AddStockToListIntentHandler");
      const stockSymbol = getSlotValue(handlerInput, 'stockSymbol');
      console.log(`Now, add ${stockSymbol} to the list`);  
      const stocks = await saveToPersistStockList(handlerInput, stockSymbol);
        
   //     const speakOutput = `Got it, ${stockSymbol}!`;
        const speakOutput = `${stockSymbol} is added. Now, you have ${stocks.length} in your list in total. `
        return handlerInput.responseBuilder
          .speak(speakOutput)
      //    .reprompt(helpMessage)
       /*   .addDelegateDirective({
              name: 'AddStockToListIntent',
              confirmationStatus: 'NONE',
              slots: {}
              })*/
          .getResponse();
        }
}

const CheckStockPriceHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    console.log("Inside CheckStockPriceHandler");
    console.log(JSON.stringify(request));
    const stockSymbol = getSlotValue(handlerInput, 'stockSymbol');
    

    return request.type === "IntentRequest" &&
           (request.intent.name === "CheckPriceIntent" && stockSymbol);
  },
  async handle(handlerInput) {
    console.log("Inside CheckStockPriceHandler - handle");

    const response = handlerInput.responseBuilder;
    const stockSymbol = getSlotValue(handlerInput, 'stockSymbol');


    const priceInfo = await getStockPrice(stockSymbol);
    let price = priceInfo.c || 1.0;

    let speakOutput = `Current stock price for ${stockSymbol} is: ${price} USD. \n`;

    if (supportsDisplay(handlerInput)) {
        console.log('Do nothing for now. Might want to expand here');
    }

    let counter = await saveStockQueryCounter(handlerInput, stockSymbol);
    console.log('Counter:', counter);

    if(counter.shouldStore){
      setAttribute(handlerInput, attr_name.REDIRECT_INTENT, 'AddStockToListIntent'); 
      setAttribute(handlerInput, attr_name.STOCK_SYMBOL, stockSymbol); 
      speakOutput += `You have checked ${stockSymbol} ${counter.count} times. Do you like to add it to your list?`;
      response.speak(speakOutput);
      // response.addDelegateDirective({
      //   name: 'AddStockToListIntent',
      //   confirmationStatus: 'NONE',
      //   slots: {
      //     stockSymbol:{
      //       name: 'stockSymbol',
      //       value: stockSymbol
      //     }
      //   }
      //   })
    }else{
       response.speak(speakOutput);
    }

    return response.getResponse();
  },
};


const CheckPortfolioIntentHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    console.log("Inside CheckPortfolioIntentHandler");
    console.log(JSON.stringify(request));
    

    return request.type === "IntentRequest" &&
           (request.intent.name === "CheckPortfolioIntent");
  },
  async handle(handlerInput) {
    console.log("Inside CheckPortfolioIntentHandler - handle");

    const response = handlerInput.responseBuilder;

    const stocks = await getPersistedStockList(handlerInput);

    const stockNum = stocks.length ;

    if(stockNum === 0){

      setAttribute(handlerInput, attr_name.REDIRECT_INTENT, 'AddStockToListIntent'); 

      return handlerInput.responseBuilder
      .addDelegateDirective({
        name: 'AddStockToListIntent',
        confirmationStatus: 'NONE',
        slots: {}
        })
        .speak(promptForAddingStock)
        .getResponse();
    }

    let speakOutput = await speakPortfolioWithSSML(stocks, handlerInput);

    return response.speak(speakOutput)
                   .reprompt(suggestAccountLink)
                   .getResponse();
  },
};

async function speakPortfolioWithSSML(stocks, handlerInput){
  let speakOutput = `You currently have ${stocks.length} stocks in your list. Here is the current prices: <break time="2s"/>`;

  let stock;
  for (stock of stocks){
    const priceInfo = await getStockPrice(stock);
    let price = priceInfo.c || 0.0;
    speakOutput += `${stock}: ${price} USD; `;
  }
  if (supportsDisplay(handlerInput)) {
      console.log('Do nothing for now. Might want to expand here');
  }
  return speakOutput;
}


const LinkAccountIntentHandler = {

  canHandle(handlerInput){
    console.log("BuyIntentHandler: envelope:", handlerInput.requestEnvelope);
     return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
         && Alexa.getIntentName(handlerInput.requestEnvelope) === 'LinkAccountIntent';
 },

  handle(handlerInput){

    var accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;

    if (accessToken == undefined){
        // The request did not include a token, so tell the user to link
        var speechText = "I will send an Link Account card to your Alexa mobile app . " +
                    "Please use the Alexa app on your mobile app. You will need to use your Stock Ninja account credentials.";

        return handlerInput.responseBuilder
            .speak(speechText)
            .withLinkAccountCard()
            .getResponse();
    } else {

      return handlerInput.responseBuilder
      .speak('You have already linked your account.')
      .reprompt('If you choose to, the account can also be unlinked on Alexa mobile app.')
      .withLinkAccountCard()
      .getResponse();

    }
  }
};


const BuyIntentHandler = {

  canHandle(handlerInput){
    console.log("BuyIntentHandler: envelope:", handlerInput.requestEnvelope);
     return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
         && Alexa.getIntentName(handlerInput.requestEnvelope) === 'BuyIntent';
 },

  handle(handlerInput){

    // This intent requires an access token so that we can get the user's
    // Ride Hailer user profile with payment information.

    // The access token is in the Context object. Access the
    // request in the HandlerInput object passed to the
    // handler.

    var accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;

    if (accessToken == undefined){
        // The request did not include a token, so tell the user to link
        // accounts and return a LinkAccount card
        var speechText = "You must have a Stock Ninja account for a stock transaction. " +
                    "Please use the Alexa app to link your Amazon account with your Stock Ninja Account.";

        return handlerInput.responseBuilder
            .speak(speechText)
            .withLinkAccountCard()
            .getResponse();
    } else {

      return handlerInput.responseBuilder
      .speak('Now, transaction dialog should start from here')
      .withLinkAccountCard()
      .getResponse();

    }
  }
};




const ConfirmationIntentHandler = {
  canHandle(handlerInput) {
    console.log("Inside YesIntentHandler");
    //const redirectIntent = getAttribute(handlerInput, attr_name.REDIRECT_INTENT);
    const request = handlerInput.requestEnvelope.request;

    return request.type === 'IntentRequest' &&
           (request.intent.name === 'AMAZON.YesIntent'||request.intent.name === 'AMAZON.NoIntent');
  },
  handle(handlerInput) {
    console.log("Inside YesIntentHandler - handle");
    const request = handlerInput.requestEnvelope.request;
    const redirectIntent = getAttribute(handlerInput, attr_name.REDIRECT_INTENT);
    let response = handlerInput.responseBuilder;
    if(request.intent.name === 'AMAZON.NoIntent'){
      console.log('User said: NO to redirect:', redirectIntent);
      if (redirectIntent){
        setAttribute(handlerInput, attr_name.REDIRECT_INTENT, null); // reset redirectIntent to empty.
        setAttribute(handlerInput, attr_name.STOCK_SYMBOL, null); 
        return response.speak('OK. Anything else?').getResponse();
      }else{
        return response.speak(exitSkillMessage).getResponse();
      }
    }

    const stockSymbol = getAttribute(handlerInput, attr_name.STOCK_SYMBOL);

    if(redirectIntent==='AddStockToListIntent' && stockSymbol){
      saveToPersistStockList(handlerInput, stockSymbol);
      return handlerInput.responseBuilder
        .speak('Done!')
        .getResponse();
    }

    setAttribute(handlerInput, attr_name.REDIRECT_INTENT, null); // reset redirectIntent to empty.
    //setAttribute(handlerInput, attr_name.STOCK_SYMBOL, null); 

    return response.addDelegateDirective({
        name: redirectIntent,
        confirmationStatus: 'NONE',
        slots: {
          stockSymbol: {
            name: 'stockSymbol',
            value: stockSymbol
          }
        }
        })
        .speak('Great.')
        .getResponse();
  },
};


const HelpHandler = {
  canHandle(handlerInput) {
    console.log("Inside HelpHandler");
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest' &&
           request.intent.name === 'AMAZON.HelpHandler';
  },
  handle(handlerInput) {
    console.log("Inside HelpHandler - handle");
    return handlerInput.responseBuilder
      .speak(helpMessage)
      .reprompt(helpMessage)
      .getResponse();
  },
};

const ExitHandler = {
  canHandle(handlerInput) {
    console.log("Inside ExitHandler");
    const attributes = handlerInput.attributesManager.getSessionAttributes();
    const request = handlerInput.requestEnvelope.request;

    return request.type === `IntentRequest` && (
              request.intent.name === 'AMAZON.StopIntent' ||
              request.intent.name === 'AMAZON.PauseIntent' ||
              request.intent.name === 'AMAZON.CancelIntent'
           );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(exitSkillMessage)
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    console.log("Inside SessionEndedRequestHandler");
    return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log(`Session ended with reason: ${JSON.stringify(handlerInput.requestEnvelope)}`);
    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    console.log("Inside ErrorHandler");
    return true;
  },
  handle(handlerInput, error) {
    console.log("Inside ErrorHandler - handle");
    console.log(`Error handled: ${JSON.stringify(error)}`);
    console.log(`Handler Input: ${JSON.stringify(handlerInput)}`);

    return handlerInput.responseBuilder
      .speak(helpMessage)
      .reprompt(helpMessage)
      .getResponse();
  },
};

/* CONSTANTS */
const skillBuilder = Alexa.SkillBuilders.custom();


const attr_name = {
    REDIRECT_INTENT: 'REDIRECT_INTENT',
    STOCK_SYMBOL: 'STOCK_SYMBOL'
};


const suggestAccountLink = 'Do you think I\'m helpful enough? I can help you even more, if you link with a Stock Ninja account.';
const exitSkillMessage = `Thank you for using stock ninja! You'll make a lot money soon!`;
const promptForAddingStock = `To add a stock, you can say Amazon, or A-M-Z-N`;
const helpMessage = `I am stock ninja, help you manage your portofolio. For example, you can ask, check price of amazon.`;


/* HELPER FUNCTIONS */


function getAttribute(handlerInput, name){
  const attributes = handlerInput.attributesManager.getSessionAttributes() || {};
  console.log('Current attribute:', attributes);
  let value = attributes[name] || null;
  console.log(`Found attribute ${name}:${value}`);
  return value;
};

function setAttribute(handlerInput, name, value){
  const attributes = handlerInput.attributesManager.getSessionAttributes() || {};
  attributes[name] = value ;
  if (!value){
    delete attributes[name];
  }
  handlerInput.attributesManager.setSessionAttributes(attributes);
};

function getSlotValue(handlerInput, slotName){
  let slots = handlerInput.requestEnvelope.request.intent.slots || {};
  let slotOfName = slots[slotName] || {} ;
  return slotOfName.value || null;
};



async function getPersistedStockList(handlerInput){
  const attributesManager = handlerInput.attributesManager;
  const persistedAttributes = await attributesManager.getPersistentAttributes() || {};

  const stocks =  persistedAttributes.stocks || [];
  console.log(`Read stocks: ${stocks}`);
  return stocks;
}

async function saveToPersistStockList(handlerInput, stockSymbol){
  const attributesManager = handlerInput.attributesManager;
  let persistedAttributes = await attributesManager.getPersistentAttributes() || {};

  let stocks = persistedAttributes.stocks || [];
  stocks.push(stockSymbol);
  persistedAttributes.stocks = stocks ;

  attributesManager.setPersistentAttributes(persistedAttributes);
  await attributesManager.savePersistentAttributes();
  console.log(`Saved stocks: ${stocks}`);
  return stocks;
}


async function saveStockQueryCounter(handlerInput, stockSymbol){
  const attributesManager = handlerInput.attributesManager;
  let persistedAttributes = await attributesManager.getPersistentAttributes() || {};

  console.log('Current persisted Attributes:', persistedAttributes);

  let stocks = persistedAttributes.stocks || [];
  let counters = persistedAttributes.queryCounters || {};

  let count = counters[stockSymbol] || 0 ;
  count = count + 1;
  counters[stockSymbol] = count ;
  persistedAttributes.queryCounters = counters ;
  attributesManager.setPersistentAttributes(persistedAttributes);
  await attributesManager.savePersistentAttributes();

  let result = {count: count};

  if(stocks.includes(stockSymbol)){
    result.shouldStore = false;
    return result;
  }
  
  result.shouldStore = (count>2);
  
  return result;

}

// returns true if the skill is running on a device with a display (show|spot)
function supportsDisplay(handlerInput) {
  var hasDisplay =
    handlerInput.requestEnvelope.context &&
    handlerInput.requestEnvelope.context.System &&
    handlerInput.requestEnvelope.context.System.device &&
    handlerInput.requestEnvelope.context.System.device.supportedInterfaces &&
    handlerInput.requestEnvelope.context.System.device.supportedInterfaces.Display
  return hasDisplay;
}



function getRandom(min, max) {
  return Math.floor((Math.random() * ((max - min) + 1)) + min);
}


//Check whether session attribute 'attributeName' has a value 'value'.
function isAttributeEqualsToValue(handlerInput, attributeName, value){
  const attributes = handlerInput.attributesManager.getSessionAttributes();
  const currentValue = attributes[attributeName] || null ;
  return value == currentValue ;
}

const stock_to_tickers = {
  facebook: 'FB',
  amazon: 'AMZN',
  apple: 'AAPL',
  netflix:'NFLX',
  google: 'GOOG',
  tesla: 'TSLA',
  microsoft: 'MSFT',
  Microsoft: 'MSFT'
}
function getStockTickerSymbol(stockName){
    return stock_to_tickers[stockName];
}


//https://finnhub.io/api/v1/quote?symbol=AAPL&token=bqn2eh7rh5re7283jbh0
 function getStockPrice(stockName) {
    let symbol = getStockTickerSymbol (stockName);
    if (!symbol){
      console.log(`Can not find the symbol for ${stockName}`);
      return null;
    }
    
    let path = `/api/v1/quote?symbol=${symbol}&token=bqn2eh7rh5re7283jbh0`;
    
    console.log(`Request stock price with ${path}`);
    
    return new Promise(((resolve, reject) => {
    var options = {
        host: 'finnhub.io',
        path: path,
        method: 'GET',
    };

    
    var req = https.request(options, res => {
        res.setEncoding('utf8');
        let responseString = "";
        
        //accept incoming data asynchronously
        res.on('data', chunk => {
            responseString = responseString + chunk;
        });
        
        //return the data when streaming is complete
        res.on('end', () => {
            console.log(responseString);
            resolve(JSON.parse(responseString));
        });
        
      res.on('error', (error) => {
        reject(error);
      });
    });
    req.end();
     }));
}

function compareSlots(slots, value) {
  for (const slot in slots) {
    if (Object.prototype.hasOwnProperty.call(slots, slot) && slots[slot].value !== undefined) {
      if (slots[slot].value.toString().toLowerCase() === value.toString().toLowerCase()) {
        return true;
      }
    }
  }

  return false;
}


/* LAMBDA SETUP */
exports.handler = skillBuilder.withPersistenceAdapter(
new persistenceAdapter.S3PersistenceAdapter({bucketName:process.env.S3_PERSISTENCE_BUCKET})
)
  .addRequestHandlers(
   // HasStockDataLaunchRequestHandler,
    LaunchRequestHandler,
    AddStockToListIntentHandler,
    CheckStockPriceHandler,
    CheckPortfolioIntentHandler,
    ConfirmationIntentHandler,
    HelpHandler,
    ExitHandler,
    SessionEndedRequestHandler
  ).addRequestInterceptors(
    LoadStockDataInterceptor
).addErrorHandlers(ErrorHandler)
  .lambda();
