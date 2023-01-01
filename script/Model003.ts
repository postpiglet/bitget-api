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
import { json } from 'stream/consumers';
import { JSONStringify } from 'ts-node/dist-raw/node-primordials';
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

// WARNING: for sensitive math you should be using a library such as decimal.js!
function roundDown(value, decimals) {
  return Number(
    Math.floor(parseFloat(value + 'e' + decimals)) + 'e-' + decimals
  );
}

/** WS event handler that uses type guards to narrow down event type */
async function handleWsUpdate(event, dicSymbolTradeInfo) {
  if (isWsFuturesAccountSnapshotEvent(event)) {
    console.log(new Date(), 'ws update (account balance):', event);
    return;
  }

  if (isWsFuturesPositionsSnapshotEvent(event)) {
    console.log(new Date(), 'ws update (positions):', event);
    return;
  }

  if(event?.arg['channel'] == 'books1')
  {
    handleWsUpdateBook1(event?.data)
  }
  // else if(event?.arg['channel'] == 'candle15m')
  // {
  //   handleWsUpdateCandle15m(event?.arg['instId'], event?.data, dicSymbolTradeInfo)
  // }

  //logWSEvent('update (unhandled)', event);
}

function handleWsUpdateBook1(data) {
    if(data[0].asks[0][1] > data[0].bids[0][1])
    {
        console.log('Short')
    }
    else if(data[0].asks[0][1] < data[0].bids[0][1])
    {
        console.log('Long')
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

function IsPostitiveCandle(open, close) {
  if(close >= open)
  {
      return true;
  }
  else
  {
      return false;
  }
}

function ConvertorNumberCandles(stringCandles:Array<Array<string>>):Array<Array<number>> {

  let returnValue:Array<Array<number>> = []

  for(var i = 0; i < stringCandles.length; ++i)
  {
    let candleata:Array<number> = []
    for(var j = 0; j < stringCandles[i].length; ++j)
    {
      candleata.push(parseFloat(stringCandles[i][j]));
    }
    returnValue.push(candleata)
  }
  return returnValue
}

function GetIndex(array, searchValue) {
  for(var i = 0; i < array.length; ++i)
  {
      if(array[i] == searchValue)
          return i;
  }
  return -1;
}

enum POSITION_SIDE {
  NONE,
  LONG,
  SHORT,
}

class OrderInfo {
    public symbol : string
    public side : POSITION_SIDE
    public isRebound : boolean  // 반등
    public targetRSI : number
    public targetRSI2 : number
    public timestamp : number
    
    constructor(symbol: string, side: POSITION_SIDE, isRebound: boolean, targetRSI: number, targetRSI2: number, timestamp: number) {
      this.symbol = symbol
      this.side = side
      this.isRebound = isRebound
      this.targetRSI = targetRSI
      this.targetRSI2 = targetRSI2
      this.timestamp = timestamp
    }

    Set(symbol: string, side: POSITION_SIDE, isRebound: boolean, targetRSI: number, targetRSI2: number, timestamp: number)
    {
      this.symbol = symbol
      this.side = side
      this.isRebound = isRebound
      this.targetRSI = targetRSI
      this.targetRSI2 = targetRSI2
      this.timestamp = timestamp
    }
    ReSet()
    {
      this.side = POSITION_SIDE.NONE
    }
}

(async () => {
  try {

    const orderInfo = new OrderInfo("", POSITION_SIDE.NONE, false, 0, 0, 0)
    const marginCoin = 'USDT'
    const leverageValue:number = 0.4

    const symbolsInfo = await client.getSymbols('umcbl');
    //let openSize = await (await client.getOpenCount('IOTAUSDT_UMCBL', marginCoin, 0.1715, 25, 20)).data['openCount']
    while(true)
    {
      if(orderInfo.side != POSITION_SIDE.NONE)
      {
        let now = Date.now()
        let pre_candle_15m = ConvertorNumberCandles(await client.getCandles(orderInfo.symbol, '15m', ((now - (1000*60*15*100)) - (1000*60*15*99)).toString(), (now - (1000*60*15*100)).toString()))
        let candle_15m = ConvertorNumberCandles(await client.getCandles(orderInfo.symbol, '15m', (now - (1000*60*15*99)).toString(), now.toString()))
        candle_15m = pre_candle_15m.concat(candle_15m)
        let closeArray = candle_15m.map(x => x[CANDLE_INDEX.CLOSE])
        var inputRSI = {
            values : closeArray,
            period : 14
        };
        let rsiArray = RSI.calculate(inputRSI);

        let isClose = false
        let getPosition = await client.getPosition(orderInfo.symbol, marginCoin)
        let profitPersent = (parseFloat(getPosition.data[0].unrealizedPL) / parseFloat(getPosition.data[0].margin)) * 100

        if(orderInfo.side == POSITION_SIDE.LONG)
        {
          if(getPosition.data[0].margin != '0')
          {           
            if(orderInfo.isRebound)
            {
              //if(rsiArray[rsiArray.length-1] >= orderInfo.targetRSI)
              if(profitPersent >= 10)
              {
                isClose = true
              }
              else if(rsiArray[rsiArray.length-1] < orderInfo.targetRSI2)
              {
                // 30분 여유
                if(Date.now() - orderInfo.timestamp > 1000 * 60 * 15 * 2)
                {
                  // 손절
                  isClose = true
                }
              }
            }
            else
            {
              if(rsiArray[rsiArray.length-1] <= orderInfo.targetRSI)
              {
                let add = Math.floor((Date.now() - orderInfo.timestamp) / (1000 * 60 * 15)) + 1
                let rsiArrayCuted = rsiArray.slice(-(20 + add))
                let maxIndex2 = GetIndex(rsiArrayCuted, orderInfo.targetRSI)
                let maxIndex1 = GetIndex(rsiArrayCuted, orderInfo.targetRSI2)
                let higherIndex = rsiArrayCuted.slice(maxIndex2, rsiArrayCuted.length).sort(function(a,b) {
                  return b-a;
                })[0]

                if(higherIndex != maxIndex2 && higherIndex != rsiArrayCuted.length-1)
                {
                  isClose = true
                }
                else
                {
                  let lowerIndex = rsiArrayCuted.slice(maxIndex1, maxIndex2).sort(function(a,b) {
                    return a-b;
                  })[0]

                  if(rsiArrayCuted[lowerIndex] >= rsiArray[rsiArray.length-1])
                  {
                    // 30분 여유
                    if(Date.now() - orderInfo.timestamp > 1000 * 60 * 15 * 2)
                    {
                      // 손절
                      isClose = true
                    }
                  }
                }
              }
            }

            if(isClose)
            {
              const closingOrder: NewFuturesOrder = {
                marginCoin: marginCoin,
                orderType: 'market',
                side: 'close_long',
                size: getPosition.data[0].available,
                symbol: getPosition.data[0].symbol,
              };
              const result = await client.submitOrder(closingOrder);
      
              SendNotiMsg(`${new Date(result.requestTime)}\n${orderInfo.symbol} Close Long Position \n${JSON.stringify(result.data)}`)
              orderInfo.ReSet()
            }
          }
        }
        else if(orderInfo.side == POSITION_SIDE.SHORT)
        {
          if(getPosition.data[1].margin != '0')
          {
            if(orderInfo.isRebound)
            {
              //if(rsiArray[rsiArray.length-1] <= orderInfo.targetRSI)
              if(profitPersent >= 10)
              {
                isClose = true
              }
              else if(rsiArray[rsiArray.length-1] > orderInfo.targetRSI2)
              {
                //손절
                isClose = true
              }
            }
            else
            {
              if(rsiArray[rsiArray.length-1] >= orderInfo.targetRSI)
              {
                let add = Math.floor((Date.now() - orderInfo.timestamp) / (1000 * 60 * 15)) + 1
                let rsiArrayCuted = rsiArray.slice(-(20 + add))
                let minIndex2 = GetIndex(rsiArrayCuted, orderInfo.targetRSI)
                let minIndex1 = GetIndex(rsiArrayCuted, orderInfo.targetRSI2)
                let lowerIndex = rsiArrayCuted.slice(minIndex2, rsiArrayCuted.length).sort(function(a,b) {
                  return a-b;
                })[0]

                if(lowerIndex != minIndex2 && lowerIndex != rsiArrayCuted.length-1)
                {
                  isClose = true
                }
                else
                {
                  let higherIndex = rsiArrayCuted.slice(minIndex1, minIndex2).sort(function(a,b) {
                    return b-a;
                  })[0]

                  if(rsiArrayCuted[higherIndex] >= rsiArray[rsiArray.length-1])
                  {
                    // 손절
                    isClose = true
                  }
                }
              }
            }

            if(isClose)
            {
              const closingOrder: NewFuturesOrder = {
                marginCoin: marginCoin,
                orderType: 'market',
                side: 'close_short',
                size: getPosition.data[1].available,
                symbol: getPosition.data[1].symbol,
              };
              const result = await client.submitOrder(closingOrder);
      
              SendNotiMsg(`${new Date(result.requestTime)}\n${orderInfo.symbol} Close Short Position \n${JSON.stringify(result.data)}`)
              orderInfo.ReSet()
            }
          }
        }

        await wait(5000)
      }
      else
      {
        let symbol:string = ''

        for(var i = 0; i < symbolsInfo.data.length-1; ++i)
        {
          symbol = symbolsInfo.data[i].symbol

          let date = new Date()
          if(date.getMinutes() % 15 != 14)
            continue
          if(date.getSeconds() < 50)
            continue
          
          let now:number = date.getTime()
          let pre_candle_15m = ConvertorNumberCandles(await client.getCandles(symbol, '15m', ((now - (1000*60*15*100)) - (1000*60*15*99)).toString(), (now - (1000*60*15*100)).toString()))
          let candle_15m = ConvertorNumberCandles(await client.getCandles(symbol, '15m', (now - (1000*60*15*99)).toString(), now.toString()))
    
          candle_15m = pre_candle_15m.concat(candle_15m)
          let closeArray = candle_15m.map(x => x[CANDLE_INDEX.CLOSE])
          var inputRSI = {
              values : closeArray,
              period : 14
          };
          let rsiArray = RSI.calculate(inputRSI);
    
          // 재료들
          let rsiArrayCuted = rsiArray.slice(-20)
          let candle_15m_cuted = candle_15m.slice(-20)
          let openArrayCuted:Array<number> = []
          let highArrayCuted :Array<number> = []
          let lowArrayCuted:Array<number> = []
          let closeArrayCuted:Array<number> = []
    
          candle_15m_cuted.forEach(element => {
            openArrayCuted.push(element[CANDLE_INDEX.OPEN])
            highArrayCuted.push(element[CANDLE_INDEX.HIGH])
            lowArrayCuted.push(element[CANDLE_INDEX.LOW])
            closeArrayCuted.push(element[CANDLE_INDEX.CLOSE])
          });
    
          // 오름차순
          let rsiAsc = [...rsiArrayCuted].sort(function(a,b) {
            return a-b;
          })
    
          // 가장 큰 두개 값
          let maxIndex1 = GetIndex(rsiArrayCuted, rsiAsc[rsiAsc.length-1])
          let maxIndex2 = GetIndex(rsiArrayCuted, rsiAsc[rsiAsc.length-2])
          // 가장 작은 두개 값
          let minIndex1 = GetIndex(rsiArrayCuted, rsiAsc[0])
          let minIndex2 = GetIndex(rsiArrayCuted, rsiAsc[1])
          // 중간 값
          let middleClose = closeArrayCuted[Math.ceil(closeArrayCuted.length*0.5)-1]
    
          let isOpenOderLong = false
          let isOpenOderShort = false
          let isRebound = false
          let targetRSI:number = 50
          let targetRSI2:number = 50
          if(minIndex2 > minIndex1             
            && minIndex2 - minIndex1 >= 3
            && (closeArrayCuted[0] > middleClose || closeArrayCuted[1] > middleClose || closeArrayCuted[2] > middleClose)
            && closeArrayCuted[minIndex1] < middleClose) 
          {
            if(minIndex2 != rsiArrayCuted.length-1)
            {
              if(rsiArrayCuted[rsiArrayCuted.length-1] > rsiArrayCuted[minIndex2])
              {
                let higherIndex = closeArrayCuted.slice(minIndex2, rsiArrayCuted.length).sort(function(a,b) {
                  return b-a;
                })[0]
      
                if(higherIndex > minIndex2 && higherIndex < rsiArrayCuted.length-1)
                {
                  if(closeArrayCuted[rsiArrayCuted.length-1] <= closeArrayCuted[minIndex2])
                  {
                    // 숏추세 포지션
                    isOpenOderShort = true
                    targetRSI = rsiArrayCuted[minIndex2]
                    targetRSI2 = rsiArrayCuted[minIndex1]
                  }
                }
              }
            }
            else
            {
              // 반등 포지션
              if(!IsPostitiveCandle(openArrayCuted[minIndex2], closeArrayCuted[minIndex2]))
              {                
                if(lowArrayCuted[minIndex2] < lowArrayCuted[minIndex1])
                {                 
                  isOpenOderLong = true
                  isRebound = true
                  targetRSI = rsiArrayCuted.slice(minIndex1, rsiArrayCuted.length).sort(function(a,b) {
                    return b-a;
                  })[0]
                  targetRSI2 = rsiArrayCuted[minIndex1]
                }
              }
            }            
          }
          else if(maxIndex2 > maxIndex1 
            && (maxIndex2 - maxIndex1) >= 3
            && (closeArrayCuted[0] < middleClose || closeArrayCuted[1] < middleClose || closeArrayCuted[2] < middleClose)
            && closeArrayCuted[maxIndex1] > middleClose)
          {
            if(maxIndex2 != rsiArrayCuted.length-1)
            {
              if(rsiArrayCuted[rsiArrayCuted.length-1] < rsiArrayCuted[maxIndex2])
              {
                let lowerIndex = closeArrayCuted.slice(maxIndex2, rsiArrayCuted.length).sort(function(a,b) {
                  return a-b;
                })[0]
      
                if(lowerIndex > maxIndex2 && lowerIndex < rsiArrayCuted.length-1)
                {
                  if(closeArrayCuted[rsiArrayCuted.length-1] >= closeArrayCuted[maxIndex2])
                  {
                    // 롱추세 포지션
                    isOpenOderLong = true
                    targetRSI = rsiArrayCuted[maxIndex2]
                    targetRSI2 = rsiArrayCuted[maxIndex1]
                  }
                }
              }
            }
            else
            {
              // 반등 포지션
              if(IsPostitiveCandle(openArrayCuted[maxIndex2], closeArrayCuted[maxIndex2]))
              {
                  if(highArrayCuted[maxIndex2] > highArrayCuted[maxIndex1])
                  {
                    isOpenOderShort = true
                    isRebound = true
                    targetRSI = rsiArrayCuted.slice(maxIndex1, rsiArrayCuted.length).sort(function(a,b) {
                      return a-b;
                    })[0]
                    targetRSI2 = rsiArrayCuted[maxIndex1]
                  }
              }
            }                        
          }

          let openSize:number = 0
          try
          {
            if(isOpenOderLong)
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
                throw `Long open / ${symbol} : accountData.available${accountData.available} is not available`
              }
  
              let openAmount = Math.floor(accountData.fixedMaxAvailable)
              if(parseFloat(symbolsInfo.data[i].minTradeNum) > openAmount)
              {
                throw `Long open / ${symbol} : minTradeNum${symbolsInfo.data[i].minTradeNum} > openAmount${openAmount}`
              }

              openSize = (await client.getOpenCount(symbol, marginCoin, closeArrayCuted[closeArrayCuted.length-1], openAmount, setLeverage)).data['openCount']
  
              const order: NewFuturesOrder = {
                marginCoin,
                orderType: 'market',
                side: 'open_long',
                size: openSize.toString(),
                symbol: symbol,
              } as const;
              const result = await client.submitOrder(order);
              orderInfo.Set(symbol, POSITION_SIDE.LONG, isRebound, targetRSI, targetRSI2, result.requestTime);
  
              SendNotiMsg(`${new Date(result.requestTime)}
              ${symbol} Open open_long Position
              ${JSON.stringify(result.data)}`)
              break
            }
            else if(isOpenOderShort)
            {
              let leverageMinMax = await client.getLeverageMinMax(symbol)
              let maxLeverage:number = parseInt(leverageMinMax?.data['maxLeverage'])
              let setLeverage:number = Math.ceil(maxLeverage * leverageValue)
  
              await client.setMarginMode(symbol, marginCoin, 'fixed')
              await client.setLeverage(symbol, marginCoin, setLeverage.toString(), 'short')
  
              let accountResult = await client.getAccount(symbol, marginCoin);
              let accountData = accountResult.data;
              if(!accountData.available)
              {
                throw `Short open / ${symbol} : accountData.available${accountData.available} is not available`
              }
  
              let openAmount = Math.floor(accountData.fixedMaxAvailable)
              if(parseFloat(symbolsInfo.data[i].minTradeNum) > openAmount)
              {
                throw `Short open / ${symbol} : minTradeNum${parseFloat(symbolsInfo.data[i].minTradeNum)} > openAmount${openAmount}`
              }

              openSize = (await client.getOpenCount(symbol, marginCoin, closeArrayCuted[closeArrayCuted.length-1], openAmount, setLeverage)).data['openCount']
  
              const order: NewFuturesOrder = {
                marginCoin,
                orderType: 'market',
                side: 'open_short',
                size: openSize.toString(),
                symbol: symbol,
              } as const;
              const result = await client.submitOrder(order);
              orderInfo.Set(symbol, POSITION_SIDE.SHORT, isRebound, targetRSI, targetRSI2, result.requestTime);
  
              SendNotiMsg(`${new Date(result.requestTime)}
              ${symbol} Open Short Position
              ${JSON.stringify(result.data)}`)
              break
            }
          }
          catch(e)
          {
            throw `symbol : ${symbol}
            side : ${isOpenOderLong ? 'Long' : 'Short'}
            openSize : ${openSize}
            isRebound : ${isRebound}
            targetRSI : ${targetRSI}
            targetRSI2 : ${targetRSI2}
            ${JSON.stringify(e)}`
          }

          await wait(100);
        }
      }
    }    
  } catch (e) {
    console.error('request failed: ', e);
    SendNotiMsg(`error : ${JSON.stringify(e)}`)
  }
})();
