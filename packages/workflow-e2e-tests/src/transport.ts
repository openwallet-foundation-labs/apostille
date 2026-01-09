import type { InboundTransport, OutboundTransport, Agent, AgentContext } from '@credo-ts/core'
import type { TransportSession } from '@credo-ts/core/build/agent/TransportService'
import type { EncryptedMessage, OutboundPackage } from '@credo-ts/core/build/types'
import type { Subscription } from 'rxjs'
import { Subject, take, takeUntil } from 'rxjs'
import { MessageReceiver, TransportService, InjectionSymbols, CredoError } from '@credo-ts/core'
import { uuid } from '@credo-ts/core/build/utils/uuid'

export type SubjectMessage = { message: EncryptedMessage; replySubject?: Subject<SubjectMessage> }

export class SubjectInboundTransport implements InboundTransport {
  public readonly ourSubject: Subject<SubjectMessage>
  private subscription?: Subscription

  public constructor(ourSubject = new Subject<SubjectMessage>()) {
    this.ourSubject = ourSubject
  }

  public async start(agent: Agent) {
    this.subscribe(agent)
  }

  public async stop() {
    this.subscription?.unsubscribe()
  }

  private subscribe(agent: Agent) {
    const transportService = agent.dependencyManager.resolve(TransportService)
    const messageReceiver = agent.dependencyManager.resolve(MessageReceiver)

    this.subscription = this.ourSubject.subscribe({
      next: async ({ message, replySubject }: SubjectMessage) => {
        let session: SubjectTransportSession | undefined
        if (replySubject) {
          session = new SubjectTransportSession(`subject-session-${uuid()}`, replySubject)
          replySubject.subscribe({ complete: () => session && transportService.removeSession(session) })
        }
        await messageReceiver.receiveMessage(message, { session })
      },
    })
  }
}

export class SubjectTransportSession implements TransportSession {
  public id: string
  public readonly type = 'subject'
  private replySubject: Subject<SubjectMessage>
  public constructor(id: string, replySubject: Subject<SubjectMessage>) {
    this.id = id
    this.replySubject = replySubject
  }
  public async send(agentContext: AgentContext, encryptedMessage: EncryptedMessage): Promise<void> {
    this.replySubject.next({ message: encryptedMessage })
  }
  public async close(): Promise<void> { this.replySubject.complete() }
}

export class SubjectOutboundTransport implements OutboundTransport {
  private agent!: Agent
  private stop$!: Subject<boolean>
  private subjectMap: { [key: string]: Subject<SubjectMessage> | undefined }
  public supportedSchemes = ['rxjs']
  public constructor(subjectMap: { [key: string]: Subject<SubjectMessage> | undefined }) { this.subjectMap = subjectMap }
  public async start(agent: Agent): Promise<void> {
    this.agent = agent
    this.stop$ = agent.dependencyManager.resolve(InjectionSymbols.Stop$)
  }
  public async stop(): Promise<void> {}
  public async sendMessage(outboundPackage: OutboundPackage) {
    const messageReceiver = this.agent.dependencyManager.resolve(MessageReceiver)
    const { payload, endpoint } = outboundPackage
    if (!endpoint) throw new CredoError('Cannot send message without endpoint')
    const subject = this.subjectMap[endpoint]
    if (!subject) throw new CredoError(`No subject found for endpoint ${endpoint}`)
    const replySubject = new Subject<SubjectMessage>()
    this.stop$.pipe(take(1)).subscribe(() => !replySubject.closed && replySubject.complete())
    replySubject.pipe(takeUntil(this.stop$)).subscribe({ next: async ({ message }) => { await messageReceiver.receiveMessage(message) } })
    subject.next({ message: payload, replySubject })
  }
}

