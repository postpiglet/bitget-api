import {
  FuturesClient,
  isWsFuturesAccountSnapshotEvent,
  isWsFuturesPositionsSnapshotEvent,
  NewFuturesOrder,
  WebsocketClient,
  WS_KEY_MAP,
  FuturesSymbolRule,
  FuturesHoldSide,
} from '../src';

//import technicalindic from 'technicalindicators'
import request from 'request'
import { json } from 'stream/consumers';
import { JSONStringify } from 'ts-node/dist-raw/node-primordials';
import { CandleData } from 'technicalindicators';
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

function GetCandleSize(higher:number, lower:number):number {
  return higher - lower
}

enum POSITION_SIDE {
  NONE,
  LONG,
  SHORT,
}

class OrderInfo {
    public symbol : string
    public side : POSITION_SIDE
    public isPointed : boolean
    public orderCandle : Array<Array<number>>
    public sumitTimeStamp : number
    public symbolInfo : Object
    public isAddOpen : boolean
    public isTrigger : boolean
    
    constructor(symbol: string, side: POSITION_SIDE, isPointed: boolean, sumitTimeStamp: number, symbolInfo: Object)
    {
      this.orderCandle = []
      this.Set(symbol, side, isPointed, sumitTimeStamp, symbolInfo)
    }

    Set(symbol: string, side: POSITION_SIDE, isPointed: boolean, sumitTimeStamp: number, symbolInfo: Object)
    {
      this.symbol = symbol
      this.side = side
      this.isPointed = isPointed
      this.sumitTimeStamp = sumitTimeStamp
      this.symbolInfo = symbolInfo
    }
    ReSet()
    {
      this.side = POSITION_SIDE.NONE
      this.orderCandle = []
      this.isAddOpen = false
      this.isPointed = false
      this.isTrigger = false
    }
}

(async () => {
  try {

    const orderInfo = new OrderInfo("", POSITION_SIDE.NONE, false, 0, {})
    const marginCoin = 'USDT'
    let leverageValue:number = 0.4
    const splitOpenValue:number = 0.25

    const symbolsInfo = await client.getSymbols('umcbl');
    //let getPosition = await client.getPosition('THETAUSDT_UMCBL', marginCoin)
    //let openSize = await (await client.getOpenCount('IOTAUSDT_UMCBL', marginCoin, 0.1715, 25, 20)).data['openCount']
    while(true)
    {
      if(orderInfo.side != POSITION_SIDE.NONE)
      {
        let now = Date.now()
        let pre_candle_15m = ConvertorNumberCandles(await client.getCandles(orderInfo.symbol, '5m', ((now - (1000*60*5*100)) - (1000*60*5*99)).toString(), (now - (1000*60*55*100)).toString()))
        let candle_15m = ConvertorNumberCandles(await client.getCandles(orderInfo.symbol, '5m', (now - (1000*60*5*99)).toString(), now.toString()))
        candle_15m = pre_candle_15m.concat(candle_15m)
        let closeArray = candle_15m.map(x => x[CANDLE_INDEX.CLOSE])
        // var inputRSI = {
        //     values : closeArray,
        //     period : 14
        // }
        // let rsiArray = RSI.calculate(inputRSI);

        let isClose = false
        let isOpen = false
        let getPosition = await client.getPosition(orderInfo.symbol, marginCoin)
        let addOpenSplitValue:number = 0

        if(orderInfo.side == POSITION_SIDE.LONG)
        {
          let positionData;
          for(var i = 0; i < getPosition.data.length; ++i)
          {
            if(getPosition.data[i].holdSide == 'long')
              positionData = getPosition.data[i]
          }

          if(positionData.margin != '0')
          {           
            let profitPersent = (parseFloat(positionData.unrealizedPL) / parseFloat(positionData.margin)) * 100

            if(orderInfo.isPointed)
            {
              if(profitPersent >= 25)
              {
                isClose = true
                leverageValue = 0.4
              }
              else
              {
                // 물타기
                switch(orderInfo.orderCandle.length)
                {
                  case 1:
                    if(profitPersent <= -5)
                    {                   
                      isOpen = true
                      addOpenSplitValue = 0.5
                    }
                    break
                  case 2:
                    if(profitPersent <= -10)
                    {
                      isOpen = true
                      addOpenSplitValue = 1
                    }
                    break
                  case 3:
                    if(profitPersent <= -15)
                    {
                      //손절
                      isClose = true

                      leverageValue += 0.1
                      if(leverageValue > 0.6)
                        leverageValue = 0.6
                    }
                    break
                }
              }
            }
            else
            {
              if(!orderInfo.isTrigger && profitPersent >= 5)
              {
                orderInfo.isTrigger = true
              }

              if(orderInfo.isTrigger && profitPersent <= 1)
              {
                isClose = true
              }
              else
              {
                if(profitPersent >= 8)
                {
                  isClose = true
                  leverageValue = 0.4
                }
                else
                {
                  // 물타기
                  switch(orderInfo.orderCandle.length)
                  {
                    case 1:
                      if(profitPersent <= -5)
                      {                   
                        isOpen = true
                        addOpenSplitValue = 0.33
                      }
                      break
                    case 2:
                      if(profitPersent <= -6)
                      {
                        isOpen = true
                        addOpenSplitValue = 0.5
                      }
                      break
                    case 3:
                      if(profitPersent <= -7)
                      {
                        isOpen = true
                        addOpenSplitValue = 1
                      }
                      break
                    case 4:
                      if(profitPersent <= -8)
                      {
                        //손절
                        isClose = true

                        leverageValue += 0.1
                        if(leverageValue > 0.6)
                          leverageValue = 0.6
                      }
                      break
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
                size: positionData.available,
                symbol: positionData.symbol,
              };
              const result = await client.submitOrder(closingOrder);
      
              SendNotiMsg(`${new Date(result.requestTime)}\n leverageValue:${leverageValue}\n isTrigger:${orderInfo.isTrigger}\n${orderInfo.symbol} Close Long Position \n${JSON.stringify(result.data)}`)
              orderInfo.ReSet()
            }
            else if(isOpen)
            {
              let accountResult = await client.getAccount(positionData.symbol, marginCoin);
              let accountData = accountResult.data;
              let openAmount = Math.floor(accountData.fixedMaxAvailable * addOpenSplitValue)              

              let openSize = (await client.getOpenCount(positionData.symbol, marginCoin, closeArray[closeArray.length-1], openAmount, accountData.fixedLongLeverage)).data['openCount']
  
              const order: NewFuturesOrder = {
                marginCoin,
                orderType: 'market',
                side: 'open_long',
                size: openSize.toString(),
                symbol: positionData.symbol,
              } as const;
              const result = await client.submitOrder(order);
              orderInfo.orderCandle.push(candle_15m[candle_15m.length-1])
              orderInfo.isAddOpen = true
              SendNotiMsg(`${new Date(result.requestTime)}\n${orderInfo.symbol} Add Long Position \n${JSON.stringify(result.data)}`)
              break
            }
          }
          else
          {
            orderInfo.ReSet()
          }
        }
        else if(orderInfo.side == POSITION_SIDE.SHORT)
        {
          let positionData;
          for(var i = 0; i < getPosition.data.length; ++i)
          {
            if(getPosition.data[i].holdSide == 'short')
              positionData = getPosition.data[i]
          }

          if(positionData.margin != '0')
          {
            let profitPersent = (parseFloat(positionData.unrealizedPL) / parseFloat(positionData.margin)) * 100

            if(orderInfo.isPointed)
            {
              if(profitPersent >= 25)
              {
                isClose = true
              }
              else
              {
                // 물타기
                switch(orderInfo.orderCandle.length)
                {
                  case 1:
                    if(profitPersent <= -5)
                    {                   
                      isOpen = true
                      addOpenSplitValue = 0.5
                    }
                    break
                  case 2:
                    if(profitPersent <= -10)
                    {
                      isOpen = true
                      addOpenSplitValue = 1
                    }
                    break
                  case 3:
                    if(profitPersent <= -15)
                    {
                      //손절
                      isClose = true
                    }
                    break
                }
              }
            }
            else
            {
              if(!orderInfo.isTrigger && profitPersent >= 5)
              {
                orderInfo.isTrigger = true
              }

              if(orderInfo.isTrigger && profitPersent <= 1)
              {
                isClose = true
              }
              else
              {
                if(profitPersent >= 8)
                {
                  isClose = true
                }
                else
                {
                  // 물타기
                  switch(orderInfo.orderCandle.length)
                  {
                    case 1:
                      if(profitPersent <= -5)
                      {                   
                        isOpen = true
                        addOpenSplitValue = 0.33
                      }
                      break
                    case 2:
                      if(profitPersent <= -6)
                      {
                        isOpen = true
                        addOpenSplitValue = 0.5
                      }
                      break
                    case 3:
                      if(profitPersent <= -7)
                      {
                        isOpen = true
                        addOpenSplitValue = 1
                      }
                      break
                    case 4:
                      if(profitPersent <= -8)
                      {
                        //손절
                        isClose = true
                      }
                      break
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
                size: positionData.available,
                symbol: positionData.symbol,
              };
              const result = await client.submitOrder(closingOrder);
      
              SendNotiMsg(`${new Date(result.requestTime)}\n leverageValue:${leverageValue}\n isTrigger:${orderInfo.isTrigger}\n${orderInfo.symbol} Close Short Position \n${JSON.stringify(result.data)}`)
              orderInfo.ReSet()
            }
            else if(isOpen)
            {
              let accountResult = await client.getAccount(positionData.symbol, marginCoin);
              let accountData = accountResult.data;
              let openAmount = Math.floor(accountData.fixedMaxAvailable * addOpenSplitValue)              

              let openSize = (await client.getOpenCount(positionData.symbol, marginCoin, closeArray[closeArray.length-1], openAmount, accountData.fixedShortLeverage)).data['openCount']
  
              const order: NewFuturesOrder = {
                marginCoin,
                orderType: 'market',
                side: 'open_short',
                size: openSize.toString(),
                symbol: positionData.symbol,
              } as const;
              const result = await client.submitOrder(order);
              orderInfo.orderCandle.push(candle_15m[candle_15m.length-1])
              orderInfo.isAddOpen = true
              SendNotiMsg(`${new Date(result.requestTime)}\n${orderInfo.symbol} Add Short Position \n${JSON.stringify(result.data)}`)
            }
          }
          else
          {
            orderInfo.ReSet()
          }
        }

        await wait(500)
      }
      else
      {
        let symbol:string = ''

        for(var i = 0; i < symbolsInfo.data.length-1; ++i)
        {
          symbol = symbolsInfo.data[i].symbol

          let date = new Date()
          let now:number = date.getTime()
          let pre_candle_5m = ConvertorNumberCandles(await client.getCandles(symbol, '5m', ((now - (1000*60*5*100)) - (1000*60*5*99)).toString(), (now - (1000*60*5*100)).toString()))
          let candle_5m = ConvertorNumberCandles(await client.getCandles(symbol, '5m', (now - (1000*60*5*99)).toString(), now.toString()))
    
          candle_5m = pre_candle_5m.concat(candle_5m)
          let closeArray = candle_5m.map(x => x[CANDLE_INDEX.CLOSE])
          var inputRSI = {
              values : closeArray,
              period : 14
          };
          let rsiArray = RSI.calculate(inputRSI);

          let isOpenOderLong = false
          let isOpenOderShort = false
          let isPointed = false

          if(rsiArray[rsiArray.length-1] > 87)
          {
            let curCandleSize = GetCandleSize(candle_5m[candle_5m.length-1][CANDLE_INDEX.HIGH], candle_5m[candle_5m.length-1][CANDLE_INDEX.LOW])
            let preCandleSize = GetCandleSize(candle_5m[candle_5m.length-2][CANDLE_INDEX.HIGH], candle_5m[candle_5m.length-2][CANDLE_INDEX.LOW])
            if(curCandleSize >= preCandleSize * 10)
            {
              isOpenOderShort = true
              isPointed = true
            }
          }
          else if(rsiArray[rsiArray.length-1] < 12)
          {
            let curCandleSize = GetCandleSize(candle_5m[candle_5m.length-1][CANDLE_INDEX.HIGH], candle_5m[candle_5m.length-1][CANDLE_INDEX.LOW])
            let preCandleSize = GetCandleSize(candle_5m[candle_5m.length-2][CANDLE_INDEX.HIGH], candle_5m[candle_5m.length-2][CANDLE_INDEX.LOW])
            if(curCandleSize >= preCandleSize * 10)
            {
              isOpenOderLong = true
              isPointed = true
            }
          }
          else
          {
            if(date.getMinutes() % 5 != 4)
              continue
            if(date.getSeconds() < 50)
              continue

            // 재료들
            let rsiArrayCuted = rsiArray.slice(-20)
            let candle_5m_cuted = candle_5m.slice(-20)
            let openArrayCuted:Array<number> = []
            let highArrayCuted :Array<number> = []
            let lowArrayCuted:Array<number> = []
            let closeArrayCuted:Array<number> = []
      
            candle_5m_cuted.forEach(element => {
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

            if(minIndex2 > minIndex1             
              && minIndex2 - minIndex1 >= 3
              && rsiArrayCuted[minIndex2] - rsiArrayCuted[minIndex2] >= 3)
              //&& (closeArrayCuted[0] > middleClose || closeArrayCuted[1] > middleClose || closeArrayCuted[2] > middleClose)
              //&& closeArrayCuted[minIndex1] < middleClose) 
            {
              if(minIndex2 == rsiArrayCuted.length-1)
              {
                // 꺽이는 포지션
                if(!IsPostitiveCandle(openArrayCuted[minIndex2], closeArrayCuted[minIndex2]))
                {                
                  if(closeArrayCuted[minIndex2] <= closeArrayCuted[minIndex1])
                  {                 
                    isOpenOderLong = true
                  }
                }
              }
              // else if(minIndex2 == rsiArrayCuted.length-2 || minIndex2 == rsiArrayCuted.length-3)
              // {
              //   if(closeArrayCuted[rsiArrayCuted.length-1] <= closeArrayCuted[minIndex1])
              //   {                 
              //     isOpenOderLong = true
              //   }
              // }       
            }
            else if(maxIndex2 > maxIndex1 
              && (maxIndex2 - maxIndex1) >= 3
              && rsiArrayCuted[maxIndex1] - rsiArrayCuted[maxIndex2] >= 3)
              //&& (closeArrayCuted[0] < middleClose || closeArrayCuted[1] < middleClose || closeArrayCuted[2] < middleClose)
              //&& closeArrayCuted[maxIndex1] > middleClose)
            {
              if(maxIndex2 == rsiArrayCuted.length-1)
              {
                // 꺽이는 포지션
                if(IsPostitiveCandle(openArrayCuted[maxIndex2], closeArrayCuted[maxIndex2]))
                {
                    if(closeArrayCuted[maxIndex2] >= closeArrayCuted[maxIndex1])
                    {
                      isOpenOderShort = true
                    }
                }
              }
              // else if(maxIndex2 == rsiArrayCuted.length-2 || maxIndex2 == rsiArrayCuted.length-3)
              // {
              //   if(closeArrayCuted[rsiArrayCuted.length-1] >= closeArrayCuted[maxIndex1])
              //   {
              //     isOpenOderShort = true
              //   }
              // }
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
  
              let openAmount = Math.floor(accountData.fixedMaxAvailable * splitOpenValue)              
              openSize = (await client.getOpenCount(symbol, marginCoin, candle_5m[candle_5m.length-1][CANDLE_INDEX.CLOSE], openAmount, setLeverage)).data['openCount']
              if(parseFloat(symbolsInfo.data[i].minTradeNum) > openSize)
              {
                throw `Long open / ${symbol} : minTradeNum${symbolsInfo.data[i].minTradeNum} > openSize${openSize}`
              }
  
              const order: NewFuturesOrder = {
                marginCoin,
                orderType: 'market',
                side: 'open_long',
                size: openSize.toString(),
                symbol: symbol,
              } as const;
              const result = await client.submitOrder(order);
              orderInfo.Set(symbol, POSITION_SIDE.LONG, isPointed, result.requestTime, symbolsInfo.data[i])
              orderInfo.orderCandle.push(candle_5m[candle_5m.length-1])
  
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
  
              let openAmount = Math.floor(accountData.fixedMaxAvailable * splitOpenValue)
              openSize = (await client.getOpenCount(symbol, marginCoin, candle_5m[candle_5m.length-1][CANDLE_INDEX.CLOSE], openAmount, setLeverage)).data['openCount']
              if(parseFloat(symbolsInfo.data[i].minTradeNum) > openSize)
              {
                throw `Short open / ${symbol} : minTradeNum${parseFloat(symbolsInfo.data[i].minTradeNum)} > openSize${openSize}`
              }

              const order: NewFuturesOrder = {
                marginCoin,
                orderType: 'market',
                side: 'open_short',
                size: openSize.toString(),
                symbol: symbol,
              } as const;
              const result = await client.submitOrder(order);
              orderInfo.Set(symbol, POSITION_SIDE.SHORT, isPointed, result.requestTime, symbolsInfo.data[i])
              orderInfo.orderCandle.push(candle_5m[candle_5m.length-1])
  
              SendNotiMsg(`${new Date(result.requestTime)}
              ${symbol} Open Short Position
              ${JSON.stringify(result.data)}`)
              break
            }
          }
          catch(e)
          {
            if(e.body.code == '40845' && e.body.msg == 'This contract has been removed')
            {
              symbolsInfo.data.splice(i, 1)
              SendNotiMsg(`symbol : ${symbol} is ${e.body.msg}`)
              break
            }
            else
            {
              throw `symbol : ${symbol}
            side : ${isOpenOderLong ? 'Long' : 'Short'}
            openSize : ${openSize}
            isPointed : ${isPointed}
            ${JSON.stringify(e)}`
            }
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
