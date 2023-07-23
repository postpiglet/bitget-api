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
      SendNotiMsg(`soket exception\n ${data}`, () => {process.exit(1)})
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

  class Candle5mInfo {
    candleArray:Array<Array<number>>;
    closeArray :Array<number>;
    //rsiArray:Array<number>;

    public Set(snapshot:Array<Array<string>>) {

        this.candleArray = []
        for(var i = 0; i < snapshot.length; ++i)
        {
            let candleata:Array<number> = []
            for(var j = 0; j < snapshot[i].length; ++j)
            {
                candleata.push(parseFloat(snapshot[i][j]));
            }
            this.candleArray.push(candleata)
        }
        this.closeArray = this.candleArray.map(x => x[CANDLE_INDEX.CLOSE])
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
    }
    public GetCurrentRSI() {
        let inputRSI = {
            values : this.closeArray,
            period : 14
        };
        let rsiArray = RSI.calculate(inputRSI);
        return rsiArray[rsiArray.length-1]
    }

    public GetOpenPosition() {
      //let rsi = this.GetCurrentRSI();
      //let curSize = GetCandleSize(this.candleArray[this.candleArray.length-1][CANDLE_INDEX.HIGH], this.candleArray[this.candleArray.length-1][CANDLE_INDEX.LOW]);
      let preSize = GetCandleSize(this.candleArray[this.candleArray.length-2][CANDLE_INDEX.HIGH], this.candleArray[this.candleArray.length-2][CANDLE_INDEX.LOW]);
      let prepreSize = GetCandleSize(this.candleArray[this.candleArray.length-3][CANDLE_INDEX.HIGH], this.candleArray[this.candleArray.length-3][CANDLE_INDEX.LOW]);
      if(preSize >= prepreSize * 10)
      {
        // 양캔들
        if(this.candleArray[this.candleArray.length-2][CANDLE_INDEX.CLOSE] - this.candleArray[this.candleArray.length-2][CANDLE_INDEX.OPEN] > 0 )
        {
          // 아래꼬리
          if(this.candleArray[this.candleArray.length-2][CANDLE_INDEX.OPEN] - this.candleArray[this.candleArray.length-2][CANDLE_INDEX.LOW]
            > this.candleArray[this.candleArray.length-2][CANDLE_INDEX.HIGH] - this.candleArray[this.candleArray.length-2][CANDLE_INDEX.CLOSE])
          {
            // 꼬리가 몸통 n보다 큰경우
            if((this.candleArray[this.candleArray.length-2][CANDLE_INDEX.OPEN] - this.candleArray[this.candleArray.length-2][CANDLE_INDEX.LOW]) * 10
              >= this.candleArray[this.candleArray.length-2][CANDLE_INDEX.CLOSE] - this.candleArray[this.candleArray.length-2][CANDLE_INDEX.OPEN])
            {
              if(this.candleArray[this.candleArray.length-1][CANDLE_INDEX.HIGH] >= this.candleArray[this.candleArray.length-2][CANDLE_INDEX.HIGH])
              {
                //롱 오픈
                return POSITION_SIDE.LONG;
              }              
            }
          }
          else if(this.candleArray[this.candleArray.length-2][CANDLE_INDEX.OPEN] - this.candleArray[this.candleArray.length-2][CANDLE_INDEX.LOW]
            < this.candleArray[this.candleArray.length-2][CANDLE_INDEX.HIGH] - this.candleArray[this.candleArray.length-2][CANDLE_INDEX.CLOSE])
          {
            if((this.candleArray[this.candleArray.length-2][CANDLE_INDEX.HIGH] - this.candleArray[this.candleArray.length-2][CANDLE_INDEX.CLOSE]) * 10
              >= this.candleArray[this.candleArray.length-2][CANDLE_INDEX.CLOSE] - this.candleArray[this.candleArray.length-2][CANDLE_INDEX.OPEN])
            {
              if(this.candleArray[this.candleArray.length-1][CANDLE_INDEX.HIGH] <= this.candleArray[this.candleArray.length-2][CANDLE_INDEX.HIGH])
              {
                //숏 오픈
                return POSITION_SIDE.SHORT;
              }
            }
            else
            {              
              return POSITION_SIDE.LONG;
            }
          }

        }
        // 음캔들
        else
        {
          // 아래꼬리
          if(this.candleArray[this.candleArray.length-2][CANDLE_INDEX.CLOSE] - this.candleArray[this.candleArray.length-2][CANDLE_INDEX.LOW]
            > this.candleArray[this.candleArray.length-2][CANDLE_INDEX.HIGH] - this.candleArray[this.candleArray.length-2][CANDLE_INDEX.OPEN])
          {
            if((this.candleArray[this.candleArray.length-2][CANDLE_INDEX.CLOSE] - this.candleArray[this.candleArray.length-2][CANDLE_INDEX.LOW]) * 10
              >= this.candleArray[this.candleArray.length-2][CANDLE_INDEX.OPEN] - this.candleArray[this.candleArray.length-2][CANDLE_INDEX.CLOSE])
            {
              if(this.candleArray[this.candleArray.length-1][CANDLE_INDEX.LOW] >= this.candleArray[this.candleArray.length-2][CANDLE_INDEX.LOW])
              {
                //롱 오픈
                return POSITION_SIDE.LONG;
              }
            }
            else
            {
              return POSITION_SIDE.SHORT;
            }
          }
          else if(this.candleArray[this.candleArray.length-2][CANDLE_INDEX.CLOSE] - this.candleArray[this.candleArray.length-2][CANDLE_INDEX.LOW]
            < this.candleArray[this.candleArray.length-2][CANDLE_INDEX.HIGH] - this.candleArray[this.candleArray.length-2][CANDLE_INDEX.OPEN])
          {
            
            if((this.candleArray[this.candleArray.length-2][CANDLE_INDEX.HIGH] - this.candleArray[this.candleArray.length-2][CANDLE_INDEX.OPEN]) * 10
              >= this.candleArray[this.candleArray.length-2][CANDLE_INDEX.OPEN] - this.candleArray[this.candleArray.length-2][CANDLE_INDEX.CLOSE])
            {
              if(this.candleArray[this.candleArray.length-1][CANDLE_INDEX.LOW] <= this.candleArray[this.candleArray.length-2][CANDLE_INDEX.LOW])
              {
                //숏 오픈
                return POSITION_SIDE.SHORT;
              }
            }
          }
        }
      }



      return POSITION_SIDE.NONE;
    }
  }
  
  class Book15Info {
    timestamp:number = 0;
    side:POSITION_SIDE = POSITION_SIDE.NONE;
    
    public Set(timestamp:number, side:POSITION_SIDE) {
      this.timestamp = timestamp;
      this.side = side;
    }
  
    public Clear() {
      this.timestamp = 0;
      this.side = POSITION_SIDE.NONE;
    }
  }
  
  class TradeQueue {
    array:Array<Array<string>> = [];
    buyCount:number = 0;
    sellCount:number = 0;
    buySize:number = 0;
    sellSize:number = 0;
    /**
     * enqueue
     */
    public enqueue(data) {
        
        if(this.array.length != 0)
        {
          if(parseInt(this.array[this.array.length-1][0]) < parseInt(data[0]))
          {
            if(this.array.length == 100)
              this.dequeue();
  
            if(data[3] == 'buy')
            {
                ++this.buyCount;
                this.buySize += parseFloat(data[2])
            }
            else if(data[3] == 'sell')
            {
                ++this.sellCount;
                this.sellSize += parseFloat(data[2])
            }
              
            this.array.push(data); // 배열에 요소를 추가한다
          }
        }
        else
        {
            if(data[3] == 'buy')
            {
                ++this.buyCount;
                this.buySize += parseFloat(data[2])
            }
            else if(data[3] == 'sell')
            {
                ++this.sellCount;
                this.sellSize += parseFloat(data[2])
            }
  
          this.array.push(data); // 배열에 요소를 추가한다
        }
    }
    /**
     * dequeue
     */
    public dequeue() {
        if(this.array[0][3] == 'buy')
        {
            --this.buyCount;
            this.buySize -= parseFloat(this.array[0][2])
        }
        else if(this.array[0][3] == 'sell')
        {
            --this.sellCount;
            this.sellSize -= parseFloat(this.array[0][2])
        }
  
        return this.array.shift(); // 첫번째 요소를 반환하고 제거한다.
    }
  
    public GetPosition() {
      if(this.buyCount >= 80 && this.buySize > this.sellSize * 3)
        return POSITION_SIDE.LONG;
      else if(this.sellCount >= 80 && this.sellSize > this.buySize * 3)
        return POSITION_SIDE.SHORT;
      else
        return POSITION_SIDE.NONE;
    }
  
    public Clear() {
      this.array = [];
      this.buyCount = 0;
      this.sellCount = 0;
    }
   
    public GetLastTimeStamp() {
      if(this.array.length == 0)
        return 0
      else
        return parseInt(this.array[this.array.length-1][0])
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
  
    if(event?.arg['channel'] == 'books15')
    {
      handleWsUpdateBook15(event?.arg.instId.concat('_UMCBL'), event?.data[0])
    }
    else if(event?.arg['channel'] == 'ticker')
    {
      handleWsUpdateTickers(event?.data[0])
    }
    else if(event?.arg['channel'] == 'positions')
    {
      handleWsUpdatePosition(event?.data)
    }
    else if(event?.arg['channel'] == 'trade')
    {
      handleWsUpdateTrade(event?.arg.instId.concat('_UMCBL'), event?.data)
    }
    else if(event?.arg['channel'] == 'candle5m')
    {
        handleWsUpdateCandle5m(event?.action, event?.arg.instId.concat('_UMCBL'), event?.data)
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
    }

    if(lockInfo.openPosition || lockInfo.closePosition)
      return

    if(orderInfo.side != POSITION_SIDE.NONE && orderInfo.symbol != symbol)
    //if(orderInfo.side != POSITION_SIDE.NONE)
      return

    if(preOrderInfo.symbol == symbol)
    {
      if((Date.now() - preOrderInfo.sumitTimeStamp) >= (1000 * 60 * 5))
      {
        preOrderInfo.ReSet();
      }
      else
      {
        return;
      }
    }

    switch(candle5mInfoDic.get(symbol)?.GetOpenPosition())
    {
      case POSITION_SIDE.LONG:
        if(orderInfo.side == POSITION_SIDE.SHORT)
        {
          lockInfo.closePosition = true
          await closePosition(orderInfo);
          lockInfo.closePosition = false
          SendNotiMsg(`${symbol} : Opposition Close`)
        }
        else if(orderInfo.side == POSITION_SIDE.NONE)
        {
          lockInfo.openPosition = true
          await openPosition(POSITION_SIDE.LONG, symbol, 0.2, 0.5, false);
          lockInfo.openPosition = false
          SendNotiMsg(`${symbol} Open Long Position`)
        }
        break;
      case POSITION_SIDE.SHORT:
        if(orderInfo.side == POSITION_SIDE.LONG)
        {
          lockInfo.closePosition = true
          await closePosition(orderInfo);
          lockInfo.closePosition = false
          SendNotiMsg(`${symbol} : Opposition Close`)
        }
        else if(orderInfo.side == POSITION_SIDE.NONE)
        {
          lockInfo.openPosition = true
          await openPosition(POSITION_SIDE.SHORT, symbol, 0.2, 0.5, false);
          lockInfo.openPosition = false
          SendNotiMsg(`${symbol} Open Short Position`)
        }
        break;
    }
  }
  
  async function handleWsUpdateTrade(symbol:string, data) {
  
    if(data.length != 0)
    {
      for(var i = data.length-1; i >= 0; --i)
        tradeQueueDic.get(symbol)?.enqueue(data[i]);      
  
      if(orderInfo.side != POSITION_SIDE.NONE && orderInfo.symbol != symbol)
        return
  
      let tradeTime:number = 0
      let book15Time:number = 0
      switch(tradeQueueDic.get(symbol)?.GetPosition())
      {
        case POSITION_SIDE.LONG:
          tradeTime = tradeQueueDic.get(symbol)?.GetLastTimeStamp() ?? 0
          book15Time = Book15InfoDic.get(symbol)?.timestamp ?? 0
          if(Book15InfoDic.get(symbol)?.side == POSITION_SIDE.LONG && Math.abs(tradeTime - book15Time) < 3000)
          {
            if(symbol == 'ETHUSDT_UMCBL')
            {
                if(orderInfo.side == POSITION_SIDE.NONE)
                {
                    if(!lockInfo.openPosition)
                        await openPosition(POSITION_SIDE.SHORT, symbol, 0.9, 0.9, true);
                }
                else if(orderInfo.side == POSITION_SIDE.LONG)
                {
                    if(!lockInfo.closePosition)
                        await closePosition(orderInfo);
                }
            }
            else
            {
                if(orderInfo.side == POSITION_SIDE.NONE)
                {
                    if(!lockInfo.openPosition)
                        await openPosition(POSITION_SIDE.LONG, symbol, 0.9, 0.9, true);
                }
                else if(orderInfo.side == POSITION_SIDE.SHORT)
                {
                    if(!lockInfo.closePosition)
                        await closePosition(orderInfo);
                }
            }
          }
          break;
        case POSITION_SIDE.SHORT:
          tradeTime = tradeQueueDic.get(symbol)?.GetLastTimeStamp() ?? 0
          book15Time = Book15InfoDic.get(symbol)?.timestamp ?? 0
          if(Book15InfoDic.get(symbol)?.side == POSITION_SIDE.SHORT && Math.abs(tradeTime - book15Time) < 3000)
          {
            if(symbol == 'ETHUSDT_UMCBL')
            {
                if(orderInfo.side == POSITION_SIDE.NONE)
                {
                    if(!lockInfo.openPosition)
                        await openPosition(POSITION_SIDE.LONG, symbol, 0.9, 0.9, true);
                }
                else if(orderInfo.side == POSITION_SIDE.SHORT)
                {
                    if(!lockInfo.closePosition)
                        await closePosition(orderInfo);
                }
            }
            else
            {
                if(orderInfo.side == POSITION_SIDE.NONE)
                {
                    if(!lockInfo.openPosition)
                        await openPosition(POSITION_SIDE.SHORT, symbol, 0.9, 0.9, true);
                }
                else if(orderInfo.side == POSITION_SIDE.LONG)
                {
                    if(!lockInfo.closePosition)
                        await closePosition(orderInfo);
                }
            }
          }
          break;
      }
    }
  }
  
  async function handleWsUpdatePosition(data) {
    if(data.length == 0)
    {
      if(orderInfo.side != POSITION_SIDE.NONE)
        SendNotiMsg(`${orderInfo.symbol} Position : ${orderInfo.side==1 ? 'Long' : 'Short'} Closed`)
  
      preOrderInfo.set(orderInfo)
      orderInfo.ReSet()
      return
    }

    //orderInfo.Set(data[0].instId, data[0].holdSide == 'long' ? POSITION_SIDE.LONG : POSITION_SIDE.SHORT, data[0].uTime)

    //if(orderInfo.side == POSITION_SIDE.NONE)
    //{
        // SendNotiMsg(`${new Date(data[0].uTime)}
        // ${data[0].instId} Position : ${data[0].holdSide} Holding
        // \n unrealizedPL : ${data[0].upl}
        // \n uplRate : ${parseFloat(data[0].uplRate)*100}`)
    //}
  }
  
  async function handleWsUpdateBook15(symbol:string, data) {
  
    let totalAsks:number = 0
    let totalBids:number = 0
    // let AsksFive:number = 0
    // let BidsFive:number = 0
  
    for(var i = 0; i < data.asks.length; ++i)
    {
      totalAsks += parseFloat(data.asks[i][1])  //매도 가격
      totalBids += parseFloat(data.bids[i][1])  //매수 가격 
    //   if(i <= 2)
    //   {
    //     AsksFive = totalAsks
    //     BidsFive = totalBids
    //   }
    }
      // 롱 포지션
      //if(AsksFive > totalAsks - AsksFive)
      if(totalAsks > totalBids * 5)
      {
        Book15InfoDic.get(symbol)?.Set(parseInt(data.ts), POSITION_SIDE.LONG)
      }
      // 숏 포지션
      //else if(BidsFive > totalBids - BidsFive)
      else if(totalBids > totalAsks * 5)
      {
        Book15InfoDic.get(symbol)?.Set(parseInt(data.ts), POSITION_SIDE.SHORT)
      }
  }
  
  async function handleWsUpdateTickers(data) {
    tickersDic[data.symbolId] = data
  }
  
  async function closePosition(info:OrderInfo)
  {
    return;
    
    lockInfo.closePosition = true
    try
    {
      let getPosition = await client.getPosition(orderInfo.symbol, marginCoin)
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
  
      const order: NewFuturesOrder = {
        marginCoin,
        orderType: 'market',
        side: info.side==1 ? 'close_long':'close_short',
        size: positionData.available,
        symbol: positionData.symbol,
      } as const;
      const result = await client.submitOrder(order);
      //tradeQueueDic.get(info.symbol)?.Clear();
      preOrderInfo.set(orderInfo)
      orderInfo.ReSet()
      lockInfo.closePosition = false
    }
    catch(e)
    {
      SendNotiMsg(
        `closeOddering /
        symbol : ${info.symbol}
        side : ${info.side==1 ? 'Long' : 'Short'}
        ${JSON.stringify(e)}`, () => {process.exit(1)})
    }
  }
  
  async function openPosition(side:POSITION_SIDE, symbol:string, leverageValue:number, splitOpenValue:number, useStoploss:boolean)
  {
    return;

    lockInfo.openPosition = true
    let openSize:string = '0'
    try
    {
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

      if(parseFloat(symbolsInfoDic[symbol].minTradeNum) > parseFloat(openSize))
      {
        throw `Side : ${side==1 ? 'Long' : 'Short'} / ${symbol} : minTradeNum${symbolsInfoDic[symbol].minTradeNum} > openSize${openSize}`
      }
  
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
        orderInfo.Set(symbol, side, result.requestTime)
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
        orderInfo.Set(symbol, side, result.requestTime)
      }
      lockInfo.openPosition = false
    }
    catch(e)
    {
      SendNotiMsg(
        `symbol : ${symbol}
        side : ${side==1 ? 'Long' : 'Short'}
        openSize : ${openSize}
        ${JSON.stringify(e)}`, () => {process.exit(1)})
    }
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
    public bSafetyTrigger : boolean
    public addOpen : boolean
    
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
    set(copy:OrderInfo)
    {
      this.symbol = copy.symbol
      this.side = copy.side
      this.sumitTimeStamp = copy.sumitTimeStamp
      this.bSafetyTrigger = copy.bSafetyTrigger
      this.addOpen = copy.addOpen
    }
    ReSet()
    {
      this.symbol = ''
      this.side = POSITION_SIDE.NONE
      this.sumitTimeStamp = 0
      this.bSafetyTrigger = false
      this.addOpen = false
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
  let Book15InfoDic = new Map<String, Book15Info>();
  let symbolsInfoDic
  let orderInfo:OrderInfo
  let preOrderInfo:OrderInfo
  let lockInfo:LockInfo
  let tradeQueueDic = new Map<string, TradeQueue>();
  let candle5mInfoDic = new Map<string, Candle5mInfo>();
  
  (async () => {
    try {
      // init property
      tickersDic = {}
      symbolsInfoDic = {}
      orderInfo = new OrderInfo('', POSITION_SIDE.NONE, 0)
      preOrderInfo = new OrderInfo('', POSITION_SIDE.NONE, 0)
      lockInfo = new LockInfo(false, false)
  
      // Add event listeners to log websocket events on account
      wsClient.on('update', (data) => handleWsUpdate(data));
      wsClient.on('open', (data) => logWSEvent('open', data));
      //wsClient.on('response', (data) => logWSEvent('response', data));
      wsClient.on('reconnect', (data) => logWSEvent('reconnect', data));
      wsClient.on('reconnected', (data) => logWSEvent('reconnected', data));
      wsClient.on('authenticated', (data) => logWSEvent('authenticated', data));
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
  
          //wsClient.subscribeTopic('MC', 'books15', symbol);
          wsClient.subscribeTopic('MC', 'ticker', symbol);
          //wsClient.subscribeTopic('MC', 'trade', symbol);
          wsClient.subscribeTopic('MC', 'candle5m', symbol);
          
          tickersDic[symbolRulesResult.data[i].symbol] = null
          symbolsInfoDic[symbolRulesResult.data[i].symbol] = symbolRulesResult.data[i]
          //tradeQueueDic.set(symbolRulesResult.data[i].symbol, new TradeQueue());
          //Book15InfoDic.set(symbolRulesResult.data[i].symbol, new Book15Info());
          candle5mInfoDic.set(symbolRulesResult.data[i].symbol, new Candle5mInfo());
      }
  
      while(true)
      {
        if(orderInfo.side != POSITION_SIDE.NONE)
        {
          let getPosition = await client.getPosition(orderInfo.symbol, marginCoin)
          let holdSide = orderInfo.side == POSITION_SIDE.LONG ? 'long' : 'short'
          let positionData;
  
          for(var i = 0; i < getPosition.data.length; ++i)
          {
            if(getPosition.data[i].holdSide == holdSide)
              positionData = getPosition.data[i]
          }
  
          if(positionData.margin != '0')
          {           
            let profitPersent = (parseFloat(positionData.unrealizedPL) / parseFloat(positionData.margin)) * 100

            if(!orderInfo.bSafetyTrigger && profitPersent >= 6)
            {
              orderInfo.bSafetyTrigger = true;
              SendNotiMsg(`${orderInfo.symbol} : bSafetyTrigger`)
            }

            if(profitPersent >= 8)
            {
              await closePosition(orderInfo);
              SendNotiMsg(`${orderInfo.symbol} Close Profit`);
            }
            else if(orderInfo.bSafetyTrigger && profitPersent < 2)
            {
              await closePosition(orderInfo);
              SendNotiMsg(`${orderInfo.symbol} Close Safe`);
            }
            else if(profitPersent < -3)
            {
              if(orderInfo.addOpen)
              {
                await closePosition(orderInfo);
                SendNotiMsg(`${orderInfo.symbol} Close StopLoss`);
              }
              else
              {
                orderInfo.addOpen = true;
                await openPosition(orderInfo.side, orderInfo.symbol, 0.2, 0.95, false);
                SendNotiMsg(`${orderInfo.symbol} Add Open ${orderInfo.side==1 ? 'Long' : 'Short'} Position`);
              }
            }
          }
          else
          {
            preOrderInfo.set(orderInfo)
            orderInfo.ReSet()
          }
        }
  
        await wait(100);
      }
  
    } catch (e) {
      console.error('request failed: ', e);
      SendNotiMsg(`error : ${e}`)
    }
  })();
  