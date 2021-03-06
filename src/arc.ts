import { ApolloClient, ApolloQueryResult } from 'apollo-client'
import { Observable as ZenObservable } from 'apollo-link'
import gql from 'graphql-tag'
import { from, Observable, Observer, of } from 'rxjs'
import { catchError, concat, filter, map } from 'rxjs/operators'
import { DAO } from './dao'
import { Operation } from './operation'
import { Proposal } from './proposal'
import { Address } from './types'
import * as utils from './utils'

const Web3 = require('web3')

export class Arc {
  public graphqlHttpProvider: string
  public graphqlWsProvider: string
  public web3HttpProvider: string
  public web3WsProvider: string

  public pendingOperations: Observable<Array<Operation<any>>> = of()
  public apolloClient: ApolloClient<object>
  // TODO: are there proper Web3 types available?
  public web3: any
  public contractAddresses: { [key: string]: Address } = {}

  constructor(options: {
    graphqlHttpProvider: string
    graphqlWsProvider: string
    web3HttpProvider?: string
    web3WsProvider?: string
    contractAddresses?: { [key: string]: Address }
  }) {
    this.graphqlHttpProvider = options.graphqlHttpProvider
    this.graphqlWsProvider = options.graphqlWsProvider
    this.web3HttpProvider = options.web3HttpProvider || ''
    this.web3WsProvider = options.web3WsProvider || ''

    this.apolloClient = utils.createApolloClient({
      graphqlHttpProvider: this.graphqlHttpProvider,
      graphqlWsProvider: this.graphqlWsProvider
    })

    if (this.web3HttpProvider) {
      this.web3 = new Web3(this.web3HttpProvider)
    }
    this.contractAddresses = options.contractAddresses || {}
  }

  /**
   * [dao description]
   * @param  address address of the dao Avatar
   * @return an instance of a DAO
   */
  public dao(address: Address): DAO {
    return new DAO(address, this)
  }

  public daos(): Observable<DAO[]> {
    const query = gql`
      {
        daos {
          id
        }
      }
    `
    return this._getObservableList(
      query,
      (r: any) => new DAO(r.id, this)
    ) as Observable<DAO[]>
  }

  public proposal(id: string): Proposal {
    return new Proposal(id, this)
  }

  /**
   * getBalance returns an observer with a stream of ETH balances
   * @param  address [description]
   * @return         [description]
   */
  public getBalance(address: Address): Observable < number > {
    const web3 = new Web3(this.web3WsProvider)
    // observe balance on new blocks
    // (note that we are basically doing expensive polling here)
    const balanceObservable = Observable.create((observer: any) => {
      web3.eth.subscribe('newBlockHeaders', (err: Error, result: any) => {
        if (err) {
          console.log(err)
          observer.error(err)
        } else {
          console.log('newblock')
          web3.eth.getBalance(address).then((balance: any) => {
            // TODO: we should probably only call next if the balance has changed
            observer.next(balance)
          })
        }
      })
    })
    // get the current balance ad start observing new blocks for balace changes
    const queryObservable = from(web3.eth.getBalance(address)).pipe(
      concat(balanceObservable)
    )
    return queryObservable as Observable<any>
  }

  /**
   * Returns an observable that:
   * - sends a query over http and returns the current list of results
   * - subscribes over a websocket to changes, and returns the updated list
   * example:
   *    const query = gql`
   *    {
   *      daos {
   *        id
   *        address
   *      }
   *    }`
   *    _getObservableList(query, (r:any) => new DAO(r.address))
   *
   * @param query The query to be run
   * @param  entity  name of the graphql entity to be queried.
   * @param  itemMap (optional) a function that takes elements of the list and creates new objects
   * @return
   */
  public _getObservableList(
    query: any,
    itemMap: (o: object) => object = (o) => o
  ) {
    const entity = query.definitions[0].selectionSet.selections[0].name.value
    return this.getObservable(query).pipe(
      map((r) => {
        if (!r.data[entity]) { throw Error(`Could not find entity "${entity}" in ${Object.keys(r.data)}`)}
        return r.data[entity]
      }),
      map((rs: object[]) => rs.map(itemMap))
    )
  }

  /**
   * Returns an observable that:
   * - sends a query over http and returns the current list of results
   * - subscribes over a websocket to changes, and returns the updated list
   * example:
   *    const query = gql`
   *    {
   *      daos {
   *        id
   *        address
   *      }
   *    }`
   *    _getObservableList(query, (r:any) => new DAO(r.address), filter((r:any) => r.address === "0x1234..."))
   *
   * @param query The query to be run
   * @param  entity  name of the graphql entity to be queried.
   * @param  itemMap (optional) a function that takes elements of the list and creates new objects
   * @param filter filter the results
   * @return
   */
  public _getObservableListWithFilter(
    query: any,
    itemMap: (o: object) => object = (o) => o,
    filterFunc: (o: any) => boolean
  ) {
    const entity = query.definitions[0].selectionSet.selections[0].name.value
    return this.getObservable(query).pipe(
      map((r: any) => {
        if (!r.data[entity]) { throw Error(`Could not find ${entity} in ${r.data}`)}
        return r.data[entity]
      }),
      filter(filterFunc),
      map((rs: object[]) => rs.map(itemMap))
    )
  }

  public _getObservableObject(
    query: any,
    entity: string,
    itemMap: (o: object) => object = (o) => o
  ) {
    return this.getObservable(query).pipe(
      map((r: any) => {
        if (!r.data) {
          return null
        }
        return r.data[entity]
      }),
      map(itemMap)
    )
  }

  public getObservable(query: any) {
    const subscriptionQuery = gql`
      subscription ${query}
    `

    // console.log(`creating observable for query:\n${query.loc.source.body}`)
    const zenObservable: ZenObservable<object[]> = this.apolloClient.subscribe<object[]>({ query: subscriptionQuery })
    const subscriptionObservable = Observable.create((observer: Observer<object[]>) => {
      const subscription = zenObservable.subscribe(observer)
      return () => subscription.unsubscribe()
    })

    const queryPromise: Promise<ApolloQueryResult<{[key: string]: object[]}>> = this.apolloClient.query({ query })

    const queryObservable = from(queryPromise).pipe(
      concat(subscriptionObservable)
    ).pipe(
      catchError((err: Error) => {
        throw Error(`${err.name}: ${err.message}\n${query.loc.source.body}`)
      })
    )

    return queryObservable as Observable<any>
  }

  public sendQuery(query: any) {
    const queryPromise = this.apolloClient.query({ query })
    return queryPromise
  }
}
