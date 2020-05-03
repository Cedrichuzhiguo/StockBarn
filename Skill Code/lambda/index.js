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


        attributesManager.setSessionAttributes(persistedAttributes);

    }
};



/* INTENT HANDLERS */
const HasStockDataLaunchRequestHandler = {
    async canHandle(handlerInput) {

        const stocks = await getPersistedStockList(handlerInput);

        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest' && (stocks.length>0);
    },
    async handle(handlerInput) {
      const stocks = await getPersistedStockList(handlerInput);

      const stockNum = stocks.length ;

      if(stockNum===1){
        const stock = stocks[0];
        const speakOutput = `Welcome back.  You currently have ${stock} in your stock list. Let me check the latest price for you.`;

        return handlerInput.responseBuilder
        .addDelegateDirective({
          name: 'CheckPriceIntent',
          confirmationStatus: 'CONFIRMED',
          // confirmationRequired: false,
          slots: {
            stockSymbol: {
                name: 'stockSymbol',
                value: stock
            }
          }
       })
       .speak(speakOutput) //Note: we have to 'speak' after delegate directive is added.
       .getResponse();
      }

      const speakOutput = `Welcome back. You currently have ${stockNum} stocks in your list. Do you like me to check the latest price?`;

        return handlerInput.responseBuilder
            .addDelegateDirective({
                name: 'CheckPriceIntent',
                confirmationStatus: 'NONE',
                slots: {}
                })
            .speak(speakOutput)
            .getResponse();
    }
};


const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === `LaunchRequest` ;
  },
  handle(handlerInput) {
    const welcomeMessage = 'Hello! Welcome to Stock Ninja! I help you manage your investment portofolio. To get it started, you can add a few stock to the list.' 
    const helpMessage = 'For example, you can say add Amazon to the list';
    return handlerInput.responseBuilder
    .addDelegateDirective({
      name: 'AddStockToListIntent',
      confirmationStatus: 'NONE',
      slots: {}
      })
      .speak(welcomeMessage)
      .reprompt(helpMessage)
      .getResponse();
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
      const stockSymbol = handlerInput.requestEnvelope.request.intent.slots.stockSymbol.value;
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
    const stockSymbol = handlerInput.requestEnvelope.request.intent.slots.stockSymbol.value;
    

    return request.type === "IntentRequest" &&
           (request.intent.name === "CheckPriceIntent" || (request.intent.name === "AMAZON.YesIntent" && stockSymbol));
  },
  async handle(handlerInput) {
    console.log("Inside CheckStockPriceHandler - handle");

    const response = handlerInput.responseBuilder;
    const stockSymbol = handlerInput.requestEnvelope.request.intent.slots.stockSymbol.value;


    const priceInfo = await getStockPrice('AAPL');
    let price = priceInfo.c || 1.0;

    let speakOutput = `Current stock price for ${stockSymbol} is: ${price} USD`;

    if (supportsDisplay(handlerInput)) {
        console.log('Do nothing for now. Might want to expand here');
    }

    return response.speak(speakOutput)
      //             .reprompt(repromptOutput)
                   .getResponse();
  },
};


const CheckPortofolioIntentHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    console.log("Inside CheckPortofolioIntentHandler");
    console.log(JSON.stringify(request));
    

    return request.type === "IntentRequest" &&
           (request.intent.name === "CheckPortofolioIntent");
  },
  async handle(handlerInput) {
    console.log("Inside CheckPortofolioIntentHandler - handle");

    const response = handlerInput.responseBuilder;

    const stocks = await getPersistedStockList(handlerInput);

    const stockNum = stocks.length ;

    if(stockNum === 0){
      return handlerInput.responseBuilder
      .addDelegateDirective({
        name: 'AddStockToListIntent',
        confirmationStatus: 'NONE',
        slots: {}
        })
        .speak(promptForAddingStock)
        .getResponse();
    }

    let speakOutput = `You currently have ${stockNum} in your portofolio. Here is the current prices:`;

    for (stock of stocks){
      const priceInfo = await getStockPrice(stock.id);
      let price = priceInfo.c || 0.0;
      speakOutput += `${stock.name}: ${price} USD; `;
    }
    if (supportsDisplay(handlerInput)) {
        console.log('Do nothing for now. Might want to expand here');
    }


    return response.speak(speakOutput)
                   .reprompt(suggestAccountLink)
                   .getResponse();
  },
};

const YesIntentHandler = {
  canHandle(handlerInput) {
    console.log("Inside RepeatHandler");
    const redirectIntent = getRedirectIntent(handlerInput);
    const request = handlerInput.requestEnvelope.request;

    return redirectIntent &&
           request.type === 'IntentRequest' &&
           request.intent.name === 'AMAZON.YesIntent';
  },
  handle(handlerInput) {
    console.log("Inside RepeatHandler - handle");
    const attributes = handlerInput.attributesManager.getSessionAttributes();
    const redirectIntent = getRedirectIntent(handlerInput);

    delete attributes.redirectIntent; // reset redirectIntent to empty.

    return handlerInput.responseBuilder
      .addDelegateDirective({
        name: redirectIntent,
        confirmationStatus: 'NONE',
        slots: {}
        })
        //.speak('Great.')
        .getResponse();
  },
};

function getRedirectIntent(handlerInput){
  const attributes = handlerInput.attributesManager.getSessionAttributes();
  let redirectIntent = attributes.redirectIntent;
  console.log(`RedirectIntent = ${redirectIntent}`);
  return redirectIntent;
}


const RepeatHandler = {
  canHandle(handlerInput) {
    console.log("Inside RepeatHandler");
    const attributes = handlerInput.attributesManager.getSessionAttributes();
    const request = handlerInput.requestEnvelope.request;

    return attributes.state === states.QUIZ &&
           request.type === 'IntentRequest' &&
           request.intent.name === 'AMAZON.RepeatHandler';
  },
  handle(handlerInput) {
    console.log("Inside RepeatHandler - handle");
    const attributes = handlerInput.attributesManager.getSessionAttributes();
    const question = getQuestion(attributes.counter, attributes.quizproperty, attributes.quizitem);

    return handlerInput.responseBuilder
      .speak(question)
      .reprompt(question)
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
const imagePath = "https://m.media-amazon.com/images/G/01/mobile-apps/dex/alexa/alexa-skills-kit/tutorials/quiz-game/state_flag/{0}x{1}/{2}._TTH_.png";
const backgroundImagePath = "https://m.media-amazon.com/images/G/01/mobile-apps/dex/alexa/alexa-skills-kit/tutorials/quiz-game/state_flag/{0}x{1}/{2}._TTH_.png"
const speechConsCorrect = ['Booya', 'All righty', 'Bam', 'Bazinga', 'Bingo', 'Boom', 'Bravo', 'Cha Ching', 'Cheers', 'Dynomite', 'Hip hip hooray', 'Hurrah', 'Hurray', 'Huzzah', 'Oh dear.  Just kidding.  Hurray', 'Kaboom', 'Kaching', 'Oh snap', 'Phew','Righto', 'Way to go', 'Well done', 'Whee', 'Woo hoo', 'Yay', 'Wowza', 'Yowsa'];
const speechConsWrong = ['Argh', 'Aw man', 'Blarg', 'Blast', 'Boo', 'Bummer', 'Darn', "D'oh", 'Dun dun dun', 'Eek', 'Honk', 'Le sigh', 'Mamma mia', 'Oh boy', 'Oh dear', 'Oof', 'Ouch', 'Ruh roh', 'Shucks', 'Uh oh', 'Wah wah', 'Whoops a daisy', 'Yikes'];
const data = [
  {StateName: 'Alabama', Abbreviation: 'AL', Capital: 'Montgomery', StatehoodYear: 1819, StatehoodOrder: 22},
  {StateName: 'Alaska', Abbreviation: 'AK', Capital: 'Juneau', StatehoodYear: 1959, StatehoodOrder: 49}
];

const states = {
  START: `_START`,
  QUIZ: `_QUIZ`,
};

const sessionAttribute = {

};


const suggestAccountLink = 'Do you think I\'m helpful enough? I can help you even more, if you link with a Stock Ninja account.';
const exitSkillMessage = `Thank you for using stock ninja! You'll make a lot money soon!`;
const promptForAddingStock = `To add a stock, you can say Amazon, or A-M-Z-N`;
const helpMessage = `I am stock ninja, help you manage your portofolio. For example, you can ask, check price of amazon.`;
const useCardsFlag = true;

/* HELPER FUNCTIONS */

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

function getBadAnswer(item) {
  return `I'm sorry. ${item} is not something I know very much about in this skill. ${helpMessage}`;
}

function getCurrentScore(score, counter) {
  return `Your current score is ${score} out of ${counter}. `;
}

function getFinalScore(score, counter) {
  return `Your final score is ${score} out of ${counter}. `;
}

function getCardTitle(item) {
  return item.StateName;
}

function getSmallImage(item) {
  return `https://m.media-amazon.com/images/G/01/mobile-apps/dex/alexa/alexa-skills-kit/tutorials/quiz-game/state_flag/720x400/${item.Abbreviation}._TTH_.png`;
}

function getLargeImage(item) {
  return `https://m.media-amazon.com/images/G/01/mobile-apps/dex/alexa/alexa-skills-kit/tutorials/quiz-game/state_flag/1200x800/${item.Abbreviation}._TTH_.png`;
}

function getImage(height, width, label) {
  return imagePath.replace("{0}", height)
    .replace("{1}", width)
    .replace("{2}", label);
}

function getBackgroundImage(label, height = 1024, width = 600) {
  return backgroundImagePath.replace("{0}", height)
    .replace("{1}", width)
    .replace("{2}", label);
}

function getSpeechDescription(item) {
  return `${item.StateName} is the ${item.StatehoodOrder} state, admitted to the Union in ${item.StatehoodYear}.  The capital of ${item.StateName} is ${item.Capital}, and the abbreviation for ${item.StateName} is <break strength='strong'/><say-as interpret-as='spell-out'>${item.Abbreviation}</say-as>.  I've added ${item.StateName} to your Alexa app.  Which other state or capital would you like to know about?`;
}

function formatCasing(key) {
  return key.split(/(?=[A-Z])/).join(' ');
}

function getQuestion(counter, property, item) {
  return `Here is your ${counter}th question.  What is the ${formatCasing(property)} of ${item.StateName}?`;
}

// getQuestionWithoutOrdinal returns the question without the ordinal and is
// used for the echo show.
function getQuestionWithoutOrdinal(property, item) {
  return "What is the " + formatCasing(property).toLowerCase() + " of "  + item.StateName + "?";
}

function getAnswer(property, item) {
  switch (property) {
    case 'Abbreviation':
      return `The ${formatCasing(property)} of ${item.StateName} is <say-as interpret-as='spell-out'>${item[property]}</say-as>. `;
    default:
      return `The ${formatCasing(property)} of ${item.StateName} is ${item[property]}. `;
  }
}

function getRandom(min, max) {
  return Math.floor((Math.random() * ((max - min) + 1)) + min);
}

function askQuestion(handlerInput) {
  console.log("I am in askQuestion()");
  //GENERATING THE RANDOM QUESTION FROM DATA
  const random = getRandom(0, data.length - 1);
  const item = data[random];
  const propertyArray = Object.getOwnPropertyNames(item);
  const property = propertyArray[getRandom(1, propertyArray.length - 1)];

  //GET SESSION ATTRIBUTES
  const attributes = handlerInput.attributesManager.getSessionAttributes();

  //SET QUESTION DATA TO ATTRIBUTES
  attributes.selectedItemIndex = random;
  attributes.quizItem = item;
  attributes.quizProperty = property;
  attributes.counter += 1;

  //SAVE ATTRIBUTES
  handlerInput.attributesManager.setSessionAttributes(attributes);

  const question = getQuestion(attributes.counter, property, item);
  return question;
}
//Check whether session attribute 'attributeName' has a value 'value'.
function isAttributeEqualsToValue(handlerInput, attributeName, value){
  const attributes = handlerInput.attributesManager.getSessionAttributes();
  const currentValue = attributes[attributeName] || null ;
  return value == currentValue ;
}


//https://finnhub.io/api/v1/quote?symbol=AAPL&token=bqn2eh7rh5re7283jbh0
 function getStockPrice(symbol) {
     return new Promise(((resolve, reject) => {
    var options = {
        host: 'finnhub.io',
        path: `/api/v1/quote?symbol=${symbol}&token=bqn2eh7rh5re7283jbh0`,
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

function getItem(slots) {
  const propertyArray = Object.getOwnPropertyNames(data[0]);
  let slotValue;

  for (const slot in slots) {
    if (Object.prototype.hasOwnProperty.call(slots, slot) && slots[slot].value !== undefined) {
      slotValue = slots[slot].value;
      for (const property in propertyArray) {
        if (Object.prototype.hasOwnProperty.call(propertyArray, property)) {
          const item = data.filter(x => x[propertyArray[property]]
            .toString().toLowerCase() === slots[slot].value.toString().toLowerCase());
          if (item.length > 0) {
            return item[0];
          }
        }
      }
    }
  }
  return slotValue;
}

function getSpeechCon(type) {
  if (type) return `<say-as interpret-as='interjection'>${speechConsCorrect[getRandom(0, speechConsCorrect.length - 1)]}! </say-as><break strength='strong'/>`;
  return `<say-as interpret-as='interjection'>${speechConsWrong[getRandom(0, speechConsWrong.length - 1)]} </say-as><break strength='strong'/>`;
}


/* LAMBDA SETUP */
exports.handler = skillBuilder.withPersistenceAdapter(
new persistenceAdapter.S3PersistenceAdapter({bucketName:process.env.S3_PERSISTENCE_BUCKET})
)
  .addRequestHandlers(
    HasStockDataLaunchRequestHandler,
    LaunchRequestHandler,
    AddStockToListIntentHandler,
    CheckStockPriceHandler,
    CheckPortofolioIntentHandler,
    YesIntentHandler,
    RepeatHandler,
    HelpHandler,
    ExitHandler,
    SessionEndedRequestHandler
  ).addRequestInterceptors(
    LoadStockDataInterceptor
).addErrorHandlers(ErrorHandler)
  .lambda();
