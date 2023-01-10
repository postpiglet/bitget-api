import {
  FuturesClient,
  isWsFuturesAccountSnapshotEvent,
  isWsFuturesPositionsSnapshotEvent,
  NewFuturesOrder,
  WebsocketClient,
  WS_KEY_MAP,
  FuturesSymbolRule,
} from '../src';

//import technicalindic from 'technicalindicators'
import request from 'request'
const RSI = require('technicalindicators').RSI

const CANDLE_INDEX = {
    TIMESTAMP : 0,
    OPEN : 1,
    HIGH : 2,
    LOW : 3,
    CLOSE : 4,
    BVOLUME : 5,
    QVOLUME : 6
}

enum POSITION_SIDE {
  NONE,
  LONG,
  SHORT,
}

// read from environmental variables
const API_KEY = 'bg_c795a18f36421db7c40cd7df2c9e1b7c';
const API_SECRET = 'ecf877c45807106b2064055a8ddd7c21789fa600e98f6e2d7851e5daeaba644f';
const API_PASS = '2205qlxmrpt';

const client = new FuturesClient({
  apiKey: API_KEY,
  // apiKey: 'apiKeyHere',
  apiSecret: API_SECRET,
  // apiSecret: 'apiSecretHere',
  apiPass: API_PASS,
  // apiPass: 'apiPassHere',
});

const wsClient = new WebsocketClient({
  apiKey: API_KEY,
  apiSecret: API_SECRET,
  apiPass: API_PASS,
});

function logWSEvent(type, data) {
  console.log(new Date(), `WS ${type} event: `, data);
}

const wait = (timeToDelay) => new Promise(resolve => setTimeout(resolve, timeToDelay))
const marginCoin = 'USDT';

// WARNING: for sensitive math you should be using a library such as decimal.js!
function roundDown(value, decimals) {
  return Number(
    Math.floor(parseFloat(value + 'e' + decimals)) + 'e-' + decimals
  );
}

/** WS event handler that uses type guards to narrow down event type */
async function handleWsUpdate(event) {
  if (isWsFuturesAccountSnapshotEvent(event)) {
    console.log(new Date(), 'ws update (account balance):', event);
    return;
  }

  if (isWsFuturesPositionsSnapshotEvent(event)) {
    console.log(new Date(), 'ws update (positions):', event);
    return;
  }

  if(event?.arg['channel'] == 'books15')
  {
    handleWsUpdateBook15(event?.arg.instId.concat('_UMCBL'), event?.data[0])
  }
  else if(event?.arg['channel'] == 'ticker')
  {
    handleWsUpdateTickers(event?.data[0])
  }
}

async function handleWsUpdateBook15(symbol:string, data) {

    let totalAsks:number = 0
    let totalBids:number = 0

    for(var i = 0; i < data.asks.length; ++i)
    {
      totalAsks += parseInt(data.asks[i][1])  //매도 가격
      totalBids += parseInt(data.bids[i][1])  //매수 가격 
    }

    if(orderInfo.side != POSITION_SIDE.NONE)
    {

    }
    else
    {
      if(totalAsks >= totalBids * 5)
      {
        // 숏 포지션
        openPosition(POSITION_SIDE.SHORT, symbol, 0.4, 0.5)
      }
      else if(totalBids >= totalAsks * 5)
      {
        // 롱 포지션
        openPosition(POSITION_SIDE.LONG, symbol, 0.4, 0.5)
      }
    }
}

async function handleWsUpdateTickers(data) {
  tickersDic[data.symbolId] = data
}

async function closePosition(side:POSITION_SIDE, symbol:string, leverageValue:number, splitOpenValue:number)
{

}

async function openPosition(side:POSITION_SIDE, symbol:string, leverageValue:number, splitOpenValue:number)
{
  lockInfo.openLock = true
  let openSize:number = 0
  try
  {
    let leverageMinMax = await client.getLeverageMinMax(symbol)
    let maxLeverage:number = parseInt(leverageMinMax?.data['maxLeverage'])
    let setLeverage:number = Math.ceil(maxLeverage * leverageValue)

    await client.setMarginMode(symbol, marginCoin, 'fixed')
    await client.setLeverage(symbol, marginCoin, setLeverage.toString(), 'long')

    let accountResult = await client.getAccount(symbol, marginCoin);
    let accountData = accountResult.data;
    if(!accountData.available)
    {
      throw `Side : ${side==1 ? 'Long' : 'Short'} / ${symbol} : accountData.available${accountData.available} is not available`
    }

    let openAmount = Math.floor(accountData.fixedMaxAvailable * splitOpenValue)              
    openSize = (await client.getOpenCount(symbol, marginCoin, tickersDic[symbol].marketPrice, openAmount, setLeverage)).data['openCount']
    if(parseFloat(symbolsInfoDic[symbol].minTradeNum) > openSize)
    {
      throw `Side : ${side==1 ? 'Long' : 'Short'} / ${symbol} : minTradeNum${symbolsInfoDic[symbol].minTradeNum} > openSize${openSize}`
    }

    const order: NewFuturesOrder = {
      marginCoin,
      orderType: 'market',
      side: side==1 ? 'open_long':'open_short',
      size: openSize.toString(),
      symbol: symbol,
    } as const;
    const result = await client.submitOrder(order);
    //result.code
    orderInfo.Set(symbol, side, result.requestTime)

    SendNotiMsg(`${new Date(result.requestTime)}
    ${symbol} Open ${side==1 ? 'Long' : 'Short'} Position
    ${JSON.stringify(result.data)}`)
  }
  catch(e)
  {
    if(e.body.code == '40845' && e.body.msg == 'This contract has been removed')
    {
      symbolsInfoDic.remove(symbol)
      SendNotiMsg(`symbol : ${symbol} is ${e.body.msg}`)
    }
    else
    {
      SendNotiMsg(
        `symbol : ${symbol}
        side : ${side==1 ? 'Long' : 'Short'}
        openSize : ${openSize}
        ${JSON.stringify(e)}`)

      return process.exit(1)
    }
  }
}

const TARGET_URL = 'https://notify-api.line.me/api/notify'
const TOKEN = 'aePw7aHBRPWsXCYLPMbnqqRFJvt1b3L2HoV9VI2VjQK'

function SendNotiMsg(msg) {
    // 라인 메시지 보내기
    request.post({
    url: TARGET_URL,
    headers: {
        'Authorization': `Bearer ${TOKEN}`
    },
    form: {
        message: msg
    }
    }, (error, response, body) => {
        // 요청 완료
        console.log(body)
    })
}

/**
 * This is a simple script wrapped in a immediately invoked function expression (to execute the below workflow immediately).
 *
 * It is designed to:
 * - open a private websocket channel to log account events
 * - check for any available USDT balance in the futures account
 * - immediately open a minimum sized long position on BTCUSDT
 * - check active positions
 * - immediately send closing orders for any active futures positions
 * - check positions again
 *
 * The corresponding UI for this is at https://www.bitget.com/en/mix/usdt/BTCUSDT_UMCBL
 */

// class SymbolTradeInfo {
//     public isOrdering: boolean
//     public data : FuturesSymbolRule

//     constructor(isOrdering: boolean, data: FuturesSymbolRule) {
//         this.isOrdering = isOrdering;
//         this.data = data;
//     }
// }

class OrderInfo {
  public symbol : string
  public side : POSITION_SIDE
  public sumitTimeStamp : number
  
  constructor(symbol: string, side: POSITION_SIDE, sumitTimeStamp: number)
  {
    this.Set(symbol, side, sumitTimeStamp)
  }

  Set(symbol: string, side: POSITION_SIDE, sumitTimeStamp: number)
  {
    this.symbol = symbol
    this.side = side
    this.sumitTimeStamp = sumitTimeStamp
  }
  ReSet()
  {
    this.side = POSITION_SIDE.NONE
  }
}

class LockInfo {
  public openLock:boolean
  public closeLock:boolean

  constructor(openLock:boolean, closeLock:boolean)
  {
    this.openLock = openLock
    this.closeLock = closeLock
  }
}

let tickersDic
let symbolsInfoDic
let orderInfo:OrderInfo
let lockInfo:LockInfo

(async () => {
  try {
    // init property
    tickersDic = {}
    symbolsInfoDic = {}
    orderInfo = new OrderInfo('', POSITION_SIDE.NONE, 0)
    lockInfo = new LockInfo(false, false)
    
    // Add event listeners to log websocket events on account
    wsClient.on('update', (data) => handleWsUpdate(data));
    wsClient.on('open', (data) => logWSEvent('open', data));
    //wsClient.on('response', (data) => logWSEvent('response', data));
    wsClient.on('reconnect', (data) => logWSEvent('reconnect', data));
    wsClient.on('reconnected', (data) => logWSEvent('reconnected', data));
    wsClient.on('authenticated', (data) => logWSEvent('authenticated', data));
    wsClient.on('exception', (data) => logWSEvent('exception', data));

    const symbolRulesResult = await client.getSymbols('umcbl');
    for(var i = 0; i < symbolRulesResult.data.length; ++i)
    {
        //let symbol = symbolRulesResult.data[i].symbol.split('_')[0]
        //wsClient.subscribeTopic('MC', 'books15', symbol);
        wsClient.subscribeTopic('MC', 'ticker', symbolRulesResult.data[i].symbol.split('_')[0]);
        tickersDic[symbolRulesResult.data[i].symbol] = null
        symbolsInfoDic[symbolRulesResult.data[i].symbol] = symbolRulesResult.data[i]
    }

    wsClient.subscribeTopic('MC', 'books15', 'BTCUSDT');
    //wsClient.subscribeTopic('MC', 'ticker', 'BTCUSDT');
  

    //const symbol = 'BTCUSDT_UMCBL';

    //const aa = await client.getCandles(symbol, 15,0,0);


    // const balanceResult = await client.getAccount(symbol, marginCoin);
    // const accountBalance = balanceResult.data;
    // // const balances = allBalances.filter((bal) => Number(bal.available) != 0);
    // const usdtAmount = accountBalance.available;
    // console.log('USDT balance: ', usdtAmount);

    // if (!usdtAmount) {
    //   console.error('No USDT to trade');
    //   return;
    // }
    // const bitcoinUSDFuturesRule = symbolRulesResult.data.find(
    //   (row) => row.symbol === symbol
    // )

    // const symbolRulesResult = await client.getSymbols('umcbl');
    // const calcuRSI = 1000 * 60 * 15 * 100 //14 * 2;
    // for(var i = 0; i < symbolRulesResult.data.length; ++i)
    // {
    //     let symbol = symbolRulesResult.data[i].symbol
    //     dicSymbolTradeInfo[symbol] = new SymbolTradeInfo(false, symbolRulesResult.data[i])
    //    // wsClient.subscribeTopic('MC', 'candle15m', symbol);
    // }
    // while(true)
    // {
    //     for(var i = 0; i < symbolRulesResult.data.length; ++i)
    //     {
    //         let now = Date.now()
    //         let position = await client.getPosition(symbolRulesResult.data[i].symbol, marginCoin)
    //         if(position.data.length == 0)
    //             continue
    //         if(position.data[0].total !== '0' || position.data[1].total !== '0')
    //             continue

    //         let candle15 = await client.getCandles(symbolRulesResult.data[i].symbol, '15m', (now - calcuRSI).toString(), now.toString())
    //         await handleWsUpdateCandle15m(symbolRulesResult.data[i].symbol, candle15, dicSymbolTradeInfo)
    //         await wait(50);
    //     }
    // }
   

  } catch (e) {
    console.error('request failed: ', e);
    SendNotiMsg(`error : ${e}`)
  }
})();
