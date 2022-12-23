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
// async function handleWsUpdateCandle15m(symbol:string, data, dicSymbolTradeInfo) {
//     try
//     {
//         if(dicSymbolTradeInfo[symbol].isOrdering == true)
//         return

//     let rawCloseArray = data.map(x => x[CANDLE_INDEX.CLOSE])
//     var inputRSI = {
//         values : rawCloseArray,
//         period : 14
//     };
//     let rsi14 = RSI.calculate(inputRSI);

//     if(rsi14[rsi14.length - 1] < 15)
//     {
//         dicSymbolTradeInfo[symbol].isOrdering = true
//         //let symbolUmcbl = symbol.concat('_UMCBL')

//         const balanceResult = await client.getAccount(symbol, marginCoin);
//         const accountBalance = balanceResult.data;
//         if(!accountBalance.available)
//             return

//         const openSize = accountBalance.fixedMaxAvailable * 0.3
//         if(dicSymbolTradeInfo[symbol].data.minTradeNum > openSize)
//             return 

//         const leverageMinMax = await client.getLeverageMinMax(symbol)
//         const maxLeverage = leverageMinMax?.data['maxLeverage']
//         const setLeverage = maxLeverage * 0.4

//         await client.setMarginMode(symbol, marginCoin, 'fixed')
//         await client.setLeverage(symbol, marginCoin, setLeverage.toString(), 'long')
        
//         const order: NewFuturesOrder = {
//             marginCoin,
//             orderType: 'market',
//             side: 'open_long',
//             size: openSize.toString(),
//             symbol: symbol,
//             presetTakeProfitPrice : (rawCloseArray[rawCloseArray.length-1] * 1.3).toString(),
//             presetStopLossPrice : (rawCloseArray[rawCloseArray.length-1] * 0.8).toString()
//           } as const;

//         const result = await client.submitOrder(order);
//         dicSymbolTradeInfo[symbol].isOrdering = false
//         SendNotiMsg(`${Date.now()}\n${symbol} Open Long Position \n${result}`);
//     }
//     else if(rsi14[rsi14.length - 1] > 85)
//     {
//         dicSymbolTradeInfo[symbol].isOrdering = true
//         //let symbolUmcbl = symbol.concat('_UMCBL')

//         const balanceResult = await client.getAccount(symbol, marginCoin);
//         const accountBalance = balanceResult.data;
//         if(!accountBalance.available)
//             return

//         const openSize = accountBalance.fixedMaxAvailable * 0.3
//         if(dicSymbolTradeInfo[symbol].data.minTradeNum > openSize)
//             return

//         const leverageMinMax = await client.getLeverageMinMax(symbol)
//         const maxLeverage = leverageMinMax?.data['maxLeverage']
//         const setLeverage = maxLeverage * 0.4

//         await client.setMarginMode(symbol, marginCoin, 'fixed')
//         await client.setLeverage(symbol, marginCoin, setLeverage.toString(), 'short')
        
//         const order: NewFuturesOrder = {
//             marginCoin,
//             orderType: 'market',
//             side: 'open_short',
//             size: openSize.toString(),
//             symbol: symbol,
//             presetTakeProfitPrice : (rawCloseArray[rawCloseArray.length-1] * 0.7).toString(),
//             presetStopLossPrice : (rawCloseArray[rawCloseArray.length-1] * 1.2).toString()
//           } as const;

//         const result = await client.submitOrder(order);
//         dicSymbolTradeInfo[symbol].isOrdering = false
//         SendNotiMsg(`${Date.now()}\n${symbol} Open Short Position \n${result}`);
//     }
//     } catch (e) {
//         console.error('request failed: ', e);
//         SendNotiMsg(`handleWsUpdateCandle15m error : ${e}`)
//     }
// }

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

enum POSITION_SIDE {
  LONG,
  SHORT,
}

class OrderInfo {
    public side : POSITION_SIDE
    public isPostitive : boolean
    public isUpperTail : boolean
    public orderCandle : Array<number>
    public isStopTrigger : boolean
    public isTrend : boolean
    
    constructor(side: POSITION_SIDE, isPostitive: boolean, isUpperTail: boolean, orderCandle : Array<number>) {
      this.side = side
      this.isPostitive = isPostitive
      this.isUpperTail = isUpperTail
      this.orderCandle = orderCandle
      this.isStopTrigger = false
      this.isTrend = false
    }

    Set(side: POSITION_SIDE, isPostitive: boolean, isUpperTail: boolean, orderCandle : Array<number>)
    {
      this.side = side
      this.isPostitive = isPostitive
      this.isUpperTail = isUpperTail
      this.orderCandle = orderCandle
      this.isStopTrigger = false
      this.isTrend = false
    }
    ReSet()
    {
      this.orderCandle = []
      this.isStopTrigger = false
      this.isTrend = false
    }
}

(async () => {
  try {

    const preOrderInfo = new OrderInfo(POSITION_SIDE.LONG, false, false, [])
    const symbol = 'BTCUSDT_UMCBL'
    const marginCoin = 'USDT'
    const leverage = '60'
    const openSize = '0.052'
    const volumeLimit = 1000
    let isOrdering = false

    // const symbolRulesResult = await client.getSymbols('umcbl');
    // const bitcoinUSDFuturesRule = symbolRulesResult.data.find(
    //   (row) => row.symbol === symbol
    // );

    await client.setMarginMode(symbol, marginCoin, 'fixed')
    await client.setLeverage(symbol, marginCoin, leverage, 'long')
    await client.setLeverage(symbol, marginCoin, leverage, 'short')

    while(true)
    {
      //const balanceResult = await client.getAccount(symbol, marginCoin);

      // 홀딩중인 경우
      //if(isOrdering)
      {
        let getPosition = await client.getPosition(symbol, marginCoin)
        let profitPersent = preOrderInfo.isTrend ? 10 : 8
        if(getPosition.data[0].margin != '0')
        {
          let persent = (parseFloat(getPosition.data[0].unrealizedPL) / parseFloat(getPosition.data[0].margin)) * 100
          if(persent > profitPersent)
          {
            const closingOrder: NewFuturesOrder = {
              marginCoin: marginCoin,
              orderType: 'market',
              side: 'close_long',
              size: getPosition.data[0].available,
              symbol: getPosition.data[0].symbol,
            };
            const result = await client.submitOrder(closingOrder);

            SendNotiMsg(`${new Date(result.requestTime)}\n${symbol} Close Long Position \n${JSON.stringify(result.data)}`)
            preOrderInfo.ReSet()
            isOrdering = false
          }
          else
          {
            if(preOrderInfo.isStopTrigger)
            {
              if(persent < 1)
              {
                const closingOrder: NewFuturesOrder = {
                  marginCoin: marginCoin,
                  orderType: 'market',
                  side: 'close_long',
                  size: getPosition.data[0].available,
                  symbol: getPosition.data[0].symbol,
                };
                const result = await client.submitOrder(closingOrder);

                SendNotiMsg(`${new Date(result.requestTime)}\n${symbol} Close Long Position \n${JSON.stringify(result.data)}`)
                preOrderInfo.ReSet()
                isOrdering = false
              }
            }
            else
            {
              if(persent > 6)
              {
                preOrderInfo.isStopTrigger = true
              }
            }
          }
          await wait(100)
          continue
        }
        else if(getPosition.data[1].margin != '0')
        {
          let persent = (parseFloat(getPosition.data[1].unrealizedPL) / parseFloat(getPosition.data[1].margin)) * 100
          if(persent > profitPersent)
          {
            const closingOrder: NewFuturesOrder = {
              marginCoin: marginCoin,
              orderType: 'market',
              side: 'close_short',
              size: getPosition.data[1].available,
              symbol: getPosition.data[1].symbol,
            };
            const result = await client.submitOrder(closingOrder);

            SendNotiMsg(`${new Date(result.requestTime)}\n${symbol} Close Short Position \n${JSON.stringify(result.data)}`)
            preOrderInfo.ReSet()
            isOrdering = false
          }
          else
          {
            if(preOrderInfo.isStopTrigger)
            {
              if(persent < 1)
              {
                const closingOrder: NewFuturesOrder = {
                  marginCoin: marginCoin,
                  orderType: 'market',
                  side: 'close_short',
                  size: getPosition.data[1].available,
                  symbol: getPosition.data[1].symbol,
                };
                const result = await client.submitOrder(closingOrder);

                SendNotiMsg(`${new Date(result.requestTime)}\n${symbol} Close Short Position \n${JSON.stringify(result.data)}`)
                preOrderInfo.ReSet()
                isOrdering = false
              }
            }
            else
            {
              if(persent > 6)
              {
                preOrderInfo.isStopTrigger = true
              }
            }
          }
          await wait(100)
          continue
        }
        // await wait(100)
        // continue
      }
        
      let now = Date.now()
      let candle_1m = await client.getCandles(symbol, '1m', (now - (1000*60)).toString(), now.toString())
      let lastCandleData:number[] = [parseInt(candle_1m[candle_1m.length-1][CANDLE_INDEX.TIMESTAMP])
                                    ,parseInt(candle_1m[candle_1m.length-1][CANDLE_INDEX.OPEN])
                                    ,parseInt(candle_1m[candle_1m.length-1][CANDLE_INDEX.HIGH])
                                    ,parseInt(candle_1m[candle_1m.length-1][CANDLE_INDEX.LOW])
                                    ,parseInt(candle_1m[candle_1m.length-1][CANDLE_INDEX.CLOSE])
                                    ,parseInt(candle_1m[candle_1m.length-1][CANDLE_INDEX.BVOLUME])
                                    ,parseInt(candle_1m[candle_1m.length-1][CANDLE_INDEX.QVOLUME])]

      // 추세돌파로 포지션 전환
      if(preOrderInfo.orderCandle.length != 0)
      {
        if(lastCandleData[CANDLE_INDEX.TIMESTAMP] - preOrderInfo.orderCandle[CANDLE_INDEX.TIMESTAMP] <= 60000)
        {
          if(lastCandleData[CANDLE_INDEX.BVOLUME] >= volumeLimit)
          {
            if(preOrderInfo.side == POSITION_SIDE.LONG)
            {
              const order: NewFuturesOrder = {
                marginCoin,
                orderType: 'market',
                side: 'open_long',
                size: openSize.toString(),
                symbol: symbol,
                presetStopLossPrice : (lastCandleData[CANDLE_INDEX.LOW]).toString()
              } as const;
              const result = await client.submitOrder(order);
              preOrderInfo.ReSet()
              preOrderInfo.isTrend = true
              isOrdering = true

              SendNotiMsg(`${new Date(result.requestTime)}\n${symbol} Open Long Position \n${JSON.stringify(result.data)}`)
              await wait(50);
              continue
            }
            else
            {
              const order: NewFuturesOrder = {
                marginCoin,
                orderType: 'market',
                side: 'open_short',
                size: openSize.toString(),
                symbol: symbol,
                presetStopLossPrice : (lastCandleData[CANDLE_INDEX.HIGH]).toString()
              } as const;
              const result = await client.submitOrder(order);
              preOrderInfo.ReSet()
              preOrderInfo.isTrend = true
              isOrdering = true
              
              SendNotiMsg(`${new Date(result.requestTime)}\n${symbol} Open Short Position \n${JSON.stringify(result.data)}`)
              await wait(50);
              continue
            }
          }
        }
        else
        {
          preOrderInfo.ReSet()
        }
      }

      // 1초 이내
      if(Date.now() - lastCandleData[CANDLE_INDEX.TIMESTAMP] > 59000)
      {
        // 볼륨 1K이상
        if(lastCandleData[CANDLE_INDEX.BVOLUME] >= volumeLimit)
        {
          // 양봉
          if(IsPostitiveCandle(lastCandleData[CANDLE_INDEX.OPEN], lastCandleData[CANDLE_INDEX.CLOSE]))
          {
            // 윗 꼬리가 큰 경우
            if((lastCandleData[CANDLE_INDEX.HIGH] - lastCandleData[CANDLE_INDEX.CLOSE]) > lastCandleData[CANDLE_INDEX.OPEN] - lastCandleData[CANDLE_INDEX.LOW])
            {
              const order: NewFuturesOrder = {
                marginCoin,
                orderType: 'market',
                side: 'open_short',
                size: openSize.toString(),
                symbol: symbol,
                presetStopLossPrice : (lastCandleData[CANDLE_INDEX.HIGH]).toString()
              } as const;
              const result = await client.submitOrder(order);
              preOrderInfo.Set(POSITION_SIDE.SHORT, true, true, lastCandleData)
              isOrdering = true

              SendNotiMsg(`${new Date(result.requestTime)}\n${symbol} Open Short Position \n${JSON.stringify(result.data)}`)
            }
            // 아래 꼬리가 큰 경우
            else if((lastCandleData[CANDLE_INDEX.OPEN] - lastCandleData[CANDLE_INDEX.LOW]) > lastCandleData[CANDLE_INDEX.HIGH] - lastCandleData[CANDLE_INDEX.CLOSE])
            {
              const order: NewFuturesOrder = {
                marginCoin,
                orderType: 'market',
                side: 'open_long',
                size: openSize.toString(),
                symbol: symbol,
                presetStopLossPrice : (lastCandleData[CANDLE_INDEX.LOW]).toString()
              } as const;
              const result = await client.submitOrder(order);
              preOrderInfo.Set(POSITION_SIDE.LONG, true, false, lastCandleData)
              isOrdering = true

              SendNotiMsg(`${new Date(result.requestTime)}\n${symbol} Open Long Position \n${JSON.stringify(result.data)}`)
            }
          }
          // 음봉
          else
          {
            // 윗 꼬리가 큰 경우
            if((lastCandleData[CANDLE_INDEX.HIGH] - lastCandleData[CANDLE_INDEX.OPEN]) > lastCandleData[CANDLE_INDEX.CLOSE] - lastCandleData[CANDLE_INDEX.LOW])
            {
              const order: NewFuturesOrder = {
                marginCoin,
                orderType: 'market',
                side: 'open_short',
                size: openSize.toString(),
                symbol: symbol,
                presetStopLossPrice : (lastCandleData[CANDLE_INDEX.HIGH]).toString()
              } as const;
              const result = await client.submitOrder(order);
              preOrderInfo.Set(POSITION_SIDE.SHORT, false, true, lastCandleData)
              isOrdering = true

              SendNotiMsg(`${new Date(result.requestTime)}\n${symbol} Open Short Position \n${JSON.stringify(result.data)}`)
            }
            // 아래 꼬리가 큰 경우
            else if((lastCandleData[CANDLE_INDEX.CLOSE] - lastCandleData[CANDLE_INDEX.LOW]) > lastCandleData[CANDLE_INDEX.HIGH] - lastCandleData[CANDLE_INDEX.OPEN])
            {
              const order: NewFuturesOrder = {
                marginCoin,
                orderType: 'market',
                side: 'open_long',
                size: openSize.toString(),
                symbol: symbol,
                presetStopLossPrice : (lastCandleData[CANDLE_INDEX.LOW]).toString()
              } as const;
              const result = await client.submitOrder(order);
              preOrderInfo.Set(POSITION_SIDE.LONG, false, false, lastCandleData)
              isOrdering = true

              SendNotiMsg(`${new Date(result.requestTime)}\n${symbol} Open Long Position \n${JSON.stringify(result.data)}`)
            }
          }
        }
      }

      if(isOrdering)
        await wait(5000);
      else
        await wait(50);
    }
    

  } catch (e) {
    console.error('request failed: ', e);
    SendNotiMsg(`error : ${JSON.stringify(e)}`)
  }
})();
