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
  import { type } from 'os';
import { stringify } from 'querystring';
import { CandleData, rsi } from 'technicalindicators';
import { debug } from 'console';
  const RSI = require('technicalindicators').RSI
  
  const CANDLE_INDEX = {
      TIMESTAMP : 0,
      OPEN : 1,
      HIGH : 2,
      LOW : 3,
      CLOSE : 4,
      BVOLUME : 5
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

    if(type == 'exception')
    {
        console.log("exception");
        
      //SendNotiMsg(`soket exception\n ${data}`, () => {process.exit(1)})
    }
    else  if(type == 'reconnect')
    {
        console.log("reconnect");
    }
    else  if(type == 'reconnected')
    {
        console.log("reconnected");
    }
  }
  
  const wait = (timeToDelay) => new Promise(resolve => setTimeout(resolve, timeToDelay))
  const marginCoin = 'USDT';
  
  // WARNING: for sensitive math you should be using a library such as decimal.js!
  function roundDown(value, decimals) {
    return Number(
      Math.floor(parseFloat(value + 'e' + decimals)) + 'e-' + decimals
    );
  }

  class CandleInfo {
    candleArray:Array<Array<number>>;
    closeArray :Array<number>;
    // continuousShortTimeStampArray:Array<number> = []
    // continuousLongTimeStampArray:Array<number> = []
    recentSignal:POSITION_SIDE;
    signalTimeStamp:number;
    rsiArray:Array<number> = [];
    checkBaseIndex:number;

    public Set(snapshot:Array<Array<string>>) {

        this.candleArray = [];
        this.closeArray = [];
        this.recentSignal = POSITION_SIDE.NONE;
        this.signalTimeStamp = 0;

        for(var i = 0; i < snapshot.length; ++i)
        {
            let candleata:Array<number> = []
            for(var j = 0; j < snapshot[i].length; ++j)
            {
                candleata.push(parseFloat(snapshot[i][j]));
            }
            this.candleArray.push(candleata)
            this.closeArray.push(candleata[CANDLE_INDEX.CLOSE])

            if(snapshot.length - i < 150)
            {
                let inputRSI = {
                    values : this.closeArray,
                    period : 14
                };
                this.rsiArray = RSI.calculate(inputRSI);
                this.CheckPosition();
            }
        }
    }

    public Push(update:Array<Array<string>>) {
        if(this.candleArray.length == 0)
            throw 'Candle Push error candleArray length is zero';
        
        for(var i = 0; i < update.length; ++i)
        {
            let lastCandleTimestamp = this.candleArray[this.candleArray.length-1][CANDLE_INDEX.TIMESTAMP]
            let updateCandleTimestamp = parseFloat(update[i][CANDLE_INDEX.TIMESTAMP])
            if(updateCandleTimestamp == lastCandleTimestamp)
            {
                let candleata:Array<number> = []
                for(var j = 0; j < update[i].length; ++j)
                {
                    candleata.push(parseFloat(update[i][j]));
                }
                this.candleArray[this.candleArray.length-1] = candleata;
                this.closeArray[this.closeArray.length-1] = candleata[CANDLE_INDEX.CLOSE];
            }
            else if(updateCandleTimestamp > lastCandleTimestamp)
            {
                this.candleArray.shift(); // 첫번째 요소를 반환하고 제거한다.
                this.closeArray.shift();
                let candleata:Array<number> = []
                for(var j = 0; j < update[i].length; ++j)
                {
                    candleata.push(parseFloat(update[i][j]));
                }
                this.candleArray.push(candleata);
                this.closeArray.push(candleata[CANDLE_INDEX.CLOSE]);
            }
        }

        let inputRSI = {
            values : this.closeArray,
            period : 14
        };
        this.rsiArray = RSI.calculate(inputRSI);
    }

    // public ClearContinuousArray()
    // {
    //     this.continuousLongTimeStampArray.length = 0;
    //     this.continuousShortTimeStampArray.length = 0;
    // }

    public GetReentSignal() : POSITION_SIDE
    {
        return this.recentSignal;
    }

    public GetCurrentTimeStamp() : number
    {
        return this.candleArray[this.candleArray.length-1][CANDLE_INDEX.TIMESTAMP];
    }

    public GetRecentSignalTimeStamp() : number
    {
        return this.signalTimeStamp;
        // if(side == POSITION_SIDE.LONG)
        // {
        //     return this.continuousLongTimeStampArray[this.continuousLongTimeStampArray.length-1];
        // }
        // else if(side == POSITION_SIDE.SHORT)
        // {
        //     return this.continuousShortTimeStampArray[this.continuousShortTimeStampArray.length-1];
        // }
        // return 0;
    }

    public IsAbleOpen(side:POSITION_SIDE, timestamp:number) : boolean
    {
        for(var i = 0; i < this.candleArray.length; ++i)
        {
            if(this.candleArray[i][CANDLE_INDEX.TIMESTAMP] == timestamp)
            {
                if(side == POSITION_SIDE.LONG)
                {
                    if(this.candleArray[i][CANDLE_INDEX.OPEN] > this.candleArray[this.candleArray.length-1][CANDLE_INDEX.CLOSE])
                    {
                        return true;
                    }
                }
                else if(side == POSITION_SIDE.SHORT)
                {
                    if(this.candleArray[i][CANDLE_INDEX.OPEN] < this.candleArray[this.candleArray.length-1][CANDLE_INDEX.CLOSE])
                    {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    public IsRsiClose(side:POSITION_SIDE, timestamp:number) : boolean
    {
        let baseIndex:number = -1;

        for(var i = 0; i < this.candleArray.length; ++i)
        {
            if(this.candleArray[i][CANDLE_INDEX.TIMESTAMP] == timestamp)
            {
                baseIndex = i;
                break;
            }
        }

        if(baseIndex != -1)
        {
            let checkCandleArray = this.candleArray.slice(-(this.candleArray.length - baseIndex));
            let checkRSIArray = this.rsiArray.slice(-(this.candleArray.length - baseIndex));
            if(side == POSITION_SIDE.LONG)
            {
                let higher:number = 0;
                let higherIndex:number = 0;
                let higherRSI:number = 0;
                let higherRsiIndex:number = 0;
                for(var i = 0; i < checkCandleArray.length; ++i)
                {
                    if(checkCandleArray[i][CANDLE_INDEX.CLOSE] - checkCandleArray[i][CANDLE_INDEX.OPEN] > 0)
                    {
                        if(checkCandleArray[i][CANDLE_INDEX.HIGH] > higher)
                        {
                            higher = checkCandleArray[i][CANDLE_INDEX.HIGH];
                            higherIndex = i;
                        }

                        if(checkRSIArray[i] > higherRSI)
                        {
                            higherRSI = checkRSIArray[i];
                            higherRsiIndex = i;
                        }
                    }
                }

                if(higherIndex != checkCandleArray.length - 1 && higherIndex > higherRsiIndex)
                {
                    return true;
                }
            }
            else if(side == POSITION_SIDE.SHORT)
            {
                let lower:number = 0;
                let lowerIndex:number = 0;
                let lowerRSI:number = 0;
                let lowerRsiIndex:number = 0;
                for(var i = 0; i < checkCandleArray.length; ++i)
                {
                    if(checkCandleArray[i][CANDLE_INDEX.CLOSE] - checkCandleArray[i][CANDLE_INDEX.OPEN] < 0)
                    {
                        if(checkCandleArray[i][CANDLE_INDEX.LOW] < lower)
                        {
                            lower = checkCandleArray[i][CANDLE_INDEX.LOW];
                            lowerIndex = i;
                        }

                        if(checkRSIArray[i] < lowerRSI)
                        {
                            lowerRSI = checkRSIArray[i];
                            lowerRsiIndex = i;
                        }
                    }
                }

                if(lowerIndex != checkCandleArray.length - 1 && lowerIndex > lowerRsiIndex)
                {
                    return true;
                }
            }
        }

        return false;
    }

    public CheckPosition() {
        
        if(this.candleArray.length < 3)
            return;

        // 전전 양캔들
        if(this.candleArray[this.candleArray.length-3][CANDLE_INDEX.CLOSE] - this.candleArray[this.candleArray.length-3][CANDLE_INDEX.OPEN] > 0)
        {
            // 전 양캔들
            if(this.candleArray[this.candleArray.length-2][CANDLE_INDEX.CLOSE] - this.candleArray[this.candleArray.length-3][CANDLE_INDEX.OPEN] > 0)
            {
                // 캔들 최고점은 하락추세 이면서 RSI는 상승인 경우
                if(this.candleArray[this.candleArray.length-3][CANDLE_INDEX.HIGH] >= this.candleArray[this.candleArray.length-2][CANDLE_INDEX.HIGH])
                {
                    if(this.rsiArray[this.rsiArray.length-3] < this.rsiArray[this.rsiArray.length-2])
                    {
                        //숏 오픈
                        // let pushTimeStamp = this.candleArray[this.candleArray.length-1][CANDLE_INDEX.TIMESTAMP];
                        // if(this.continuousShortTimeStampArray.length == 0 || this.continuousShortTimeStampArray[this.continuousShortTimeStampArray.length-1] != pushTimeStamp)
                        // {
                        //     this.continuousShortTimeStampArray.push(pushTimeStamp);
                        // }
                        // this.continuousLongTimeStampArray = [];
                        this.recentSignal = POSITION_SIDE.SHORT;
                        this.signalTimeStamp = this.candleArray[this.candleArray.length-1][CANDLE_INDEX.TIMESTAMP];
                        //return POSITION_SIDE.SHORT; 
                    }
                }
            }
        }
        // 전전 음캔들
        else if(this.candleArray[this.candleArray.length-3][CANDLE_INDEX.CLOSE] - this.candleArray[this.candleArray.length-3][CANDLE_INDEX.OPEN] < 0)
        {
             // 전 음캔들
             if(this.candleArray[this.candleArray.length-2][CANDLE_INDEX.CLOSE] - this.candleArray[this.candleArray.length-3][CANDLE_INDEX.OPEN] < 0)
             {
                // 캔들 최하점은 상승추세 이면서 RSI는 하락인 경우
                if(this.candleArray[this.candleArray.length-3][CANDLE_INDEX.LOW] <= this.candleArray[this.candleArray.length-2][CANDLE_INDEX.LOW])
                {
                    if(this.rsiArray[this.rsiArray.length-3] > this.rsiArray[this.rsiArray.length-2])
                    {
                        //롱 오픈
                        // let pushTimeStamp = this.candleArray[this.candleArray.length-1][CANDLE_INDEX.TIMESTAMP];
                        // if(this.continuousLongTimeStampArray.length == 0 || this.continuousLongTimeStampArray[this.continuousLongTimeStampArray.length-1] != pushTimeStamp)
                        // {
                        //     this.continuousLongTimeStampArray.push(pushTimeStamp);
                        // }
                        // this.continuousShortTimeStampArray = [];
                        this.recentSignal = POSITION_SIDE.LONG;
                        this.signalTimeStamp = this.candleArray[this.candleArray.length-1][CANDLE_INDEX.TIMESTAMP];
                        //return POSITION_SIDE.LONG;
                    }
                }
             }
        }
        return POSITION_SIDE.NONE;
    }
  }
  
  /** WS event handler that uses type guards to narrow down event type */
  async function handleWsUpdate(event) { 
  
    if (isWsFuturesAccountSnapshotEvent(event)) {
      console.log(new Date(), 'ws update (account balance):', event);
      return
    }
  
    if (isWsFuturesPositionsSnapshotEvent(event)) {
      console.log(new Date(), 'ws update (positions):', event);
    }
  
    if(event?.arg['channel'] == 'ticker')
    {
      handleWsUpdateTickers(event?.data[0])
    }
    else if(event?.arg['channel'] == 'positions')
    {
      handleWsUpdatePosition(event?.data)
    }
    else if(event?.arg['channel'] == 'candle1m')
    {
        handleWsUpdateCandle1m(event?.action, event?.arg.instId.concat('_UMCBL'), event?.data)
    }
    else if(event?.arg['channel'] == 'candle5m')
    {
        handleWsUpdateCandle5m(event?.action, event?.arg.instId.concat('_UMCBL'), event?.data)
    }
    else if(event?.arg['channel'] == 'candle15m')
    {
        handleWsUpdateCandle15m(event?.action, event?.arg.instId.concat('_UMCBL'), event?.data)
    }
  }

  async function handleWsUpdateCandle1m(action:string, symbol:string, data) {
  
    if(action == 'snapshot')
    {
        candle1mInfoDic.get(symbol)?.Set(data);
    }
    else if(action == 'update')
    {
        candle1mInfoDic.get(symbol)?.Push(data);
        candle1mInfoDic.get(symbol)?.CheckPosition();
    }
  }

  async function handleWsUpdateCandle5m(action:string, symbol:string, data) {
  
    if(action == 'snapshot')
    {
        candle5mInfoDic.get(symbol)?.Set(data);
    }
    else if(action == 'update')
    {
        candle5mInfoDic.get(symbol)?.Push(data);
        candle5mInfoDic.get(symbol)?.CheckPosition();
    }
  }

  async function handleWsUpdateCandle15m(action:string, symbol:string, data) {
  
    if(action == 'snapshot')
    {
        candle15mInfoDic.get(symbol)?.Set(data);
    }
    else if(action == 'update')
    {
        candle15mInfoDic.get(symbol)?.Push(data);
        candle15mInfoDic.get(symbol)?.CheckPosition();
    }
  }
  
  async function handleWsUpdatePosition(data) {
    // if(lockInfo.openPosition || lockInfo.closePosition)
    //     return

    // if(data.length == 0)
    // {
    //   orderInfo.ReSet();
    // }
    // else
    // {
    //     if(orderInfo.side == POSITION_SIDE.NONE)
    //     {
    //         let symbol : string = data[0].instId;
    //         let side : POSITION_SIDE = data[0].holdSide == 'long' ? POSITION_SIDE.LONG : POSITION_SIDE.SHORT;
    //         let utime : number =  parseInt(data[0].uTime);
    //         orderInfo.Set(symbol, side, utime-(utime%1000*60*5));
    //     }
    // }
  }
  
  async function handleWsUpdateTickers(data) {
    tickersDic[data.symbolId] = data
  }

  async function GetCurrentProfitPersent(symbol:string) : Promise<number>{

    let getPosition = await client.getPosition(symbol, marginCoin)
    let holdSide = orderInfoDic.get(symbol)?.side == POSITION_SIDE.LONG ? 'long' : 'short'
    let positionData;
    let profitPersent:number = 0;

    for(var i = 0; i < getPosition.data.length; ++i)
    {
      if(getPosition.data[i].holdSide == holdSide)
        positionData = getPosition.data[i]
    }

    if(positionData.margin != '0')
    {           
        profitPersent = (parseFloat(positionData.unrealizedPL) / parseFloat(positionData.margin)) * 100;
    }
    
    return profitPersent;
  }
  
  async function closePosition(symbol:string, info:OrderInfo) : Promise<number>
  {
    let profitLossPersent:number = 0;
    try
    {
      let getPosition = await client.getPosition(symbol, marginCoin)
      let positionData;
      for(var i = 0; i < getPosition.data.length; ++i)
      {
        if(info.side == POSITION_SIDE.LONG)
        {
          if(getPosition.data[i].holdSide == 'long')
          {
            positionData = getPosition.data[i]
            break
          }
        }
        else if(info.side == POSITION_SIDE.SHORT)
        {
          if(getPosition.data[i].holdSide == 'short')
          {
            positionData = getPosition.data[i]
            break
          }
        }
      }

      if(positionData.margin != '0')
      {           
        profitLossPersent = (parseFloat(positionData.unrealizedPL) / parseFloat(positionData.margin)) * 100;
      }
  
      const order: NewFuturesOrder = {
        marginCoin,
        orderType: 'market',
        side: info.side==1 ? 'close_long':'close_short',
        size: positionData.available,
        symbol: positionData.symbol,
      } as const;
      const result = await client.submitOrder(order);
      --totalOpenCount;
      totalAddOpenCount -= info.addOpenCount;
      //candleInfoDic.get(info.symbol)?.ClearContinuousArray();
      info.ReSet()
      return profitLossPersent
    }
    catch(e)
    {
      SendNotiMsg(
        `closeOddering /
        symbol : ${symbol}
        side : ${info.side==1 ? 'Long' : 'Short'}
        ${JSON.stringify(e)}`, () => {process.exit(1)})
    
        return profitLossPersent;
    }
  }
  
  async function openPosition(side:POSITION_SIDE, symbol:string, leverageValue:number, splitOpenValue:number, useStoploss:boolean) : Promise<boolean>
  {
    let openSize:string = '0'
    try
    {
        if(splitOpenValue == 1)
            splitOpenValue = 0.95;

      let leverageMinMax = await client.getLeverageMinMax(symbol)
      let maxLeverage:number = parseInt(leverageMinMax?.data['maxLeverage'])
      let setLeverage:number = Math.ceil(maxLeverage * leverageValue)
  
      await client.setMarginMode(symbol, marginCoin, 'fixed')
      await client.setLeverage(symbol, marginCoin, setLeverage.toString(), side==1 ? 'long':'short')
  
      let accountResult = await client.getAccount(symbol, marginCoin);
      let accountData = accountResult.data;
      if(!accountData.available)
      {
        throw `Side : ${side==1 ? 'Long' : 'Short'} / ${symbol} : accountData.available${accountData.available} is not available`
      }

      let openAmount = Math.floor(accountData.fixedMaxAvailable * splitOpenValue)      
      let marketPrice = parseFloat(tickersDic[symbol].markPrice)        
      openSize = (await client.getOpenCount(symbol, marginCoin, marketPrice, openAmount, setLeverage)).data['openCount']

    //   if(parseFloat(symbolsInfoDic[symbol].minTradeNum) > parseFloat(openSize))
    //   {
    //     SendNotiMsg(`Side : ${side==1 ? 'Long' : 'Short'} / ${symbol} : minTradeNum${symbolsInfoDic[symbol].minTradeNum} > openSize(${openSize})`);
    //     return false;
    //   }
  
      if(useStoploss)
      {
        let pricePlace:number = parseInt(symbolsInfoDic[symbol].pricePlace)
        let priceEndStep:number  = parseInt(symbolsInfoDic[symbol].priceEndStep)
        let presetTakeProfitPrice:number = 0
        let presetStopLossPrice:number = 0
    
        if(side == POSITION_SIDE.LONG)
        {
          presetTakeProfitPrice = (marketPrice + ((marketPrice * (0.10)) / setLeverage))
          presetStopLossPrice = (marketPrice - ((marketPrice * (0.03)) / setLeverage))
    
          let pPowValue = Math.pow(10, pricePlace)
          let pRest:number = (parseFloat((presetTakeProfitPrice % 1).toFixed(pricePlace)) * pPowValue) % priceEndStep
          if(pRest == 0)
            presetTakeProfitPrice = parseFloat(presetTakeProfitPrice.toFixed(pricePlace))
          else
          presetTakeProfitPrice = parseFloat(presetTakeProfitPrice.toFixed(pricePlace)) + ((priceEndStep - pRest) / pPowValue)
          
          let sPowValue = Math.pow(10, pricePlace)
          let sRest:number = (parseFloat((presetStopLossPrice % 1).toFixed(pricePlace)) * sPowValue) % priceEndStep
          presetStopLossPrice = parseFloat(presetStopLossPrice.toFixed(pricePlace)) - (sRest / sPowValue)
        }
        else if(side == POSITION_SIDE.SHORT)
        {
          presetTakeProfitPrice = (marketPrice - ((marketPrice * (0.10)) / setLeverage))
          presetStopLossPrice = (marketPrice + ((marketPrice * (0.03)) / setLeverage))
    
          let pPowValue = Math.pow(10, pricePlace)
          let pRest:number = (parseFloat((presetTakeProfitPrice % 1).toFixed(pricePlace)) * pPowValue) % priceEndStep
          presetTakeProfitPrice = parseFloat(presetTakeProfitPrice.toFixed(pricePlace)) - (pRest / pPowValue)
          
          let sPowValue = Math.pow(10, pricePlace)
          let sRest:number = (parseFloat((presetStopLossPrice % 1).toFixed(pricePlace)) * sPowValue) % priceEndStep
          if(sRest == 0)
            presetStopLossPrice = parseFloat(presetStopLossPrice.toFixed(pricePlace))
          else
            presetStopLossPrice = parseFloat(presetStopLossPrice.toFixed(pricePlace)) - ((priceEndStep - sRest) / sPowValue)
        }

        const order: NewFuturesOrder = {
          marginCoin,
          orderType: 'market',
          side: side==1 ? 'open_long':'open_short',
          size: openSize,
          //size: symbolsInfoDic[symbol].minTradeNum,
          symbol: symbol,
          presetTakeProfitPrice: presetTakeProfitPrice.toString(),
          presetStopLossPrice: presetStopLossPrice.toString(),
        } as const;
        const result = await client.submitOrder(order);        
        orderInfoDic.get(symbol)?.Set(side, candle15mInfoDic.get(symbol)?.GetCurrentTimeStamp() ?? 0)
      }
      else
      {
        const order: NewFuturesOrder = {
          marginCoin,
          orderType: 'market',
          side: side==1 ? 'open_long':'open_short',
          size: openSize,
          //size: symbolsInfoDic[symbol].minTradeNum,
          symbol: symbol,
          //presetTakeProfitPrice: presetTakeProfitPrice.toString(),
          //presetStopLossPrice: presetStopLossPrice.toString(),
        } as const;
        const result = await client.submitOrder(order);
        orderInfoDic.get(symbol)?.Set(side, candle15mInfoDic.get(symbol)?.GetCurrentTimeStamp() ?? 0)
      }
      return true;
    }
    catch(e)
    {
    //   SendNotiMsg(
    //     `symbol : ${symbol}
    //     side : ${side==1 ? 'Long' : 'Short'}
    //     openSize : ${openSize}
    //     ${JSON.stringify(e)}`, () => {process.exit(1)})
        SendNotiMsg(
            `symbol : ${symbol}
            side : ${side==1 ? 'Long' : 'Short'}
            openSize : ${openSize}
            ${JSON.stringify(e)}`);
    }
    return false;
  }

  function GetCandleSize(higher:number, lower:number):number {
    return higher - lower
  }
  
  const TARGET_URL = 'https://notify-api.line.me/api/notify'
  const TOKEN = 'aePw7aHBRPWsXCYLPMbnqqRFJvt1b3L2HoV9VI2VjQK'
  
  function SendNotiMsg(msg, callBack?) {
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
          if(callBack != null)
            callBack()
      })
  }
  
  class OrderInfo {
    public side : POSITION_SIDE
    public sumitTimeStamp : number
    public addOpenCount : number
    
    constructor(side: POSITION_SIDE, sumitTimeStamp: number)
    {
        this.Set(side, sumitTimeStamp)
    }
  
    Set(side: POSITION_SIDE, sumitTimeStamp: number)
    {
      this.side = side
      this.sumitTimeStamp = sumitTimeStamp
      this.addOpenCount = 0
    }
    set(copy:OrderInfo)
    {
      this.side = copy.side
      this.sumitTimeStamp = copy.sumitTimeStamp
      this.addOpenCount = copy.addOpenCount
    }
    ReSet()
    {
      this.side = POSITION_SIDE.NONE
      this.sumitTimeStamp = 0
      this.addOpenCount = 0
    }
  }
  
  class LockInfo {
    public openPosition:boolean
    public closePosition:boolean
  
    constructor(openPosition:boolean, closePosition:boolean)
    {
      this.openPosition = openPosition
      this.closePosition = closePosition
    }
  }
  
  let tickersDic
  let symbolsInfoDic
  let orderInfoDic = new Map<string, OrderInfo>();
  //let lockInfoDIc = new Map<string, LockInfo>();
  let lockInfo:boolean;
  let candle1mInfoDic = new Map<string, CandleInfo>();
  let candle5mInfoDic = new Map<string, CandleInfo>();
  let candle15mInfoDic = new Map<string, CandleInfo>();
  let totalOpenCount:number;
  let totalAddOpenCount:number;
  const totalOpenCountMax:number = 3;
  const continuouseCheckCount:number = 3;
  const openLverageValue:number = 0.15;
  
  (async () => {
    try {
      // init property
      tickersDic = {}
      symbolsInfoDic = {}
      //orderInfo = new OrderInfo('', POSITION_SIDE.NONE, 0)
      lockInfo = false;
      totalOpenCount = 0;
      totalAddOpenCount = 0;
  
      // Add event listeners to log websocket events on account
      wsClient.on('update', (data) => handleWsUpdate(data));
      wsClient.on('open', (data) => logWSEvent('open', data));
      wsClient.on('response', (data) => logWSEvent('response', data));
      wsClient.on('reconnect', (data) => logWSEvent('reconnect', data));
      wsClient.on('reconnected', (data) => logWSEvent('reconnected', data));
      //wsClient.on('authenticated', (data) => logWSEvent('authenticated', data));
      wsClient.on('exception', (data) => logWSEvent('exception', data));
  
      //wsClient.subscribeTopic('UMCBL', 'positions');

      //wsClient.subscribeTopic('MC', 'candle5m', 'BTCUSDT');
      //candle5mInfoDic.set('BTCUSDT', new Candle5mInfo());

      const symbolRulesResult = await client.getSymbols('umcbl');
      for(var i = 0; i < symbolRulesResult.data.length; ++i)
      {
          let symbol = symbolRulesResult.data[i].symbol.split('_')[0]
          if(symbol == 'FOOTBALLUSDT' || symbol == 'MTLUSDT')
            continue
        // if(symbol != 'BTCUSDT')
        //     continue
          
          orderInfoDic.set(symbolRulesResult.data[i].symbol,  new OrderInfo(POSITION_SIDE.NONE, 0));
          //lockInfoDIc.set(symbolRulesResult.data[i].symbol, new LockInfo(false, false));
          tickersDic[symbolRulesResult.data[i].symbol] = null;
          symbolsInfoDic[symbolRulesResult.data[i].symbol] = symbolRulesResult.data[i];
          candle1mInfoDic.set(symbolRulesResult.data[i].symbol, new CandleInfo());
          candle5mInfoDic.set(symbolRulesResult.data[i].symbol, new CandleInfo());
          candle15mInfoDic.set(symbolRulesResult.data[i].symbol, new CandleInfo());

           wsClient.subscribeTopic('MC', 'ticker', symbol);
           wsClient.subscribeTopic('MC', 'candle1m', symbol);
           wsClient.subscribeTopic('MC', 'candle5m', symbol);
           wsClient.subscribeTopic('MC', 'candle15m', symbol);
      }


      let orderInfoArray = Array.from(orderInfoDic.values());
      let symbolArray = Array.from(orderInfoDic.keys());
      while(true)
      {        
        for(var i = 0; i < orderInfoArray.length; ++i)
        {
            let orderInfo = orderInfoArray[i];
            let symbol = symbolArray[i];
            if(orderInfo.side != POSITION_SIDE.NONE)
            {
                if(lockInfo)
                    continue;
    
                // 손절 및 물타기
                let profitPersent = await GetCurrentProfitPersent(symbol);
                if(profitPersent < -10)
                {
                    let splitOpenValue = (1 / (totalOpenCountMax*2 - (totalOpenCount + totalAddOpenCount)))
                    if(orderInfo.addOpenCount == 0)
                    {
                        lockInfo = true;
                        let isOpenSucces = await openPosition(orderInfo.side, symbol, openLverageValue, splitOpenValue, false);
                        if(isOpenSucces)
                        {
                            orderInfo.addOpenCount = 1;
                            totalAddOpenCount += orderInfo.addOpenCount;
                            SendNotiMsg(`${symbol} Add Open\n${profitPersent}%
                                totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
                        }
                        else
                        {
                            SendNotiMsg(`${symbol} Fail Add Open\n${profitPersent}%
                                totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
                        }
                        lockInfo = false;
                    }
                    else
                    {
                        lockInfo = true;
                        await closePosition(symbol, orderInfo);
                        lockInfo = false;
                        SendNotiMsg(`${symbol} Force Close\n${profitPersent}%
                            totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
                    }
                    continue;
                }
    
                // 익절
                if(candle5mInfoDic.get(symbol)?.IsRsiClose(orderInfo.side, orderInfo.sumitTimeStamp) || candle15mInfoDic.get(symbol)?.IsRsiClose(orderInfo.side, orderInfo.sumitTimeStamp))
                {
                    lockInfo = true
                    await closePosition(symbol, orderInfo);
                    lockInfo = false
                    SendNotiMsg(`${symbol} realization of profit\n${profitPersent}%
                        totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
                    continue;
                }
    
                //let candle1mSignal = candle1mInfoDic.get(symbol)?.GetReentSignal() ?? POSITION_SIDE.NONE;
                let candle5mSignal = candle5mInfoDic.get(symbol)?.GetReentSignal() ?? POSITION_SIDE.NONE;
                let candle15mSignal = candle15mInfoDic.get(symbol)?.GetReentSignal() ?? POSITION_SIDE.NONE;
                // 반대방향
                if(orderInfo.side != candle5mSignal || orderInfo.side != candle15mSignal)
                {
                    lockInfo = true
                    let profitLoss = await closePosition(symbol, orderInfo);
                    lockInfo = false
                    SendNotiMsg(`${symbol} : Opposition Close\n${profitLoss}%
                        totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
                    continue;
                }
            }
            else
            {
                // 포지션 오픈
                if(totalOpenCount < totalOpenCountMax)
                {
                    let splitOpenValue = (1 / (totalOpenCountMax*2 - (totalOpenCount + totalAddOpenCount)))
                    let candle1mSignal = candle1mInfoDic.get(symbol)?.GetReentSignal() ?? POSITION_SIDE.NONE;
                    let candle5mSignal = candle5mInfoDic.get(symbol)?.GetReentSignal() ?? POSITION_SIDE.NONE;
                    let candle15mSignal = candle15mInfoDic.get(symbol)?.GetReentSignal() ?? POSITION_SIDE.NONE;
                    let candle1mSignalTimeStamp = candle1mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0;
                    let candle5mSignalTimeStamp = candle5mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0;
                    let candle15mSignalTimeStamp = candle15mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0;

                    if(candle1mSignalTimeStamp <= candle5mSignalTimeStamp && candle5mSignalTimeStamp <= candle15mSignalTimeStamp)
                    {
                        if(candle1mSignal == POSITION_SIDE.LONG && candle5mSignal == POSITION_SIDE.LONG && candle15mSignal == POSITION_SIDE.LONG)
                        {
                            if(candle15mInfoDic.get(symbol)?.IsAbleOpen(POSITION_SIDE.LONG, candle15mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0)
                                && candle5mInfoDic.get(symbol)?.IsAbleOpen(POSITION_SIDE.LONG, candle5mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0)
                                && candle1mInfoDic.get(symbol)?.IsAbleOpen(POSITION_SIDE.LONG, candle1mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0))
                            {
                                lockInfo = true
                                let isOpenSucces = await openPosition(POSITION_SIDE.LONG, symbol, openLverageValue, splitOpenValue, false);
                                if(isOpenSucces)
                                {
                                    ++totalOpenCount;
                                    SendNotiMsg(`${symbol} Open Long Position
                                        totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
                                }
                                else
                                {
                                    SendNotiMsg(`${symbol} Fail Open Long Position
                                        totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
                                }
                                lockInfo = false
                                
                            }
                        }
                        else if(candle1mSignal == POSITION_SIDE.SHORT && candle5mSignal == POSITION_SIDE.SHORT && candle15mSignal == POSITION_SIDE.SHORT)
                        {
                            if(candle15mInfoDic.get(symbol)?.IsAbleOpen(POSITION_SIDE.SHORT, candle15mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0)
                                && candle5mInfoDic.get(symbol)?.IsAbleOpen(POSITION_SIDE.SHORT, candle5mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0)
                                && candle1mInfoDic.get(symbol)?.IsAbleOpen(POSITION_SIDE.SHORT, candle1mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0))
                            {
                                lockInfo = true
                                let isOpenSucces = await openPosition(POSITION_SIDE.SHORT, symbol, openLverageValue, splitOpenValue, false);
                                if(isOpenSucces)
                                {
                                    ++totalOpenCount;
                                    SendNotiMsg(`${symbol} Open Short Position
                                        totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
                                }
                                else
                                {
                                    SendNotiMsg(`${symbol} Fail Open Short Position
                                        totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
                                }
                                lockInfo = false
                            }
                        }
                    }
                }
            }
        }
        await wait(300);
      }
  
    } catch (e) {
      console.error('request failed: ', e);
      SendNotiMsg(`error : ${e}`)
    }
  })();
  