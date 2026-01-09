import type {
  AddMessageOptions,
  GetAvailableMessageCountOptions,
  MessagePickupRepository,
  QueuedMessage,
  RemoveMessagesOptions,
  TakeFromQueueOptions,
} from '@credo-ts/core'

import { AgentContext, injectable, utils } from '@credo-ts/core'

import { MessageRecord } from './MessageRecord'
import { MessageRepository } from './MessageRepository'


export interface NotificationMessage {
  messageType: string
  token: string
}

@injectable()
export class StorageServiceMessageQueue implements MessagePickupRepository {
  private messageRepository: MessageRepository
  private agentContext: AgentContext

  public constructor(
    messageRepository: MessageRepository,
    agentContext: AgentContext,
  ) {
    this.messageRepository = messageRepository
    this.agentContext = agentContext
  }

  public async getAvailableMessageCount(options: GetAvailableMessageCountOptions) {
    const { connectionId } = options

    const messageRecords = await this.messageRepository.findByConnectionId(this.agentContext, connectionId)

    this.agentContext.config.logger.debug(`Found ${messageRecords.length} messages for connection ${connectionId}`)

    return messageRecords.length
  }

  public async takeFromQueue(options: TakeFromQueueOptions): Promise<QueuedMessage[]> {
    const { connectionId, limit, deleteMessages } = options

    const messageRecords = await this.messageRepository.findByConnectionId(this.agentContext, connectionId)

    const messagesToTake = limit ?? messageRecords.length
    this.agentContext.config.logger.debug(
      `Taking ${messagesToTake} messages from queue for connection ${connectionId} (of total ${
        messageRecords.length
      }) with deleteMessages=${String(deleteMessages)}`
    )

    const messageRecordsToReturn = messageRecords.splice(0, messagesToTake)

    if (deleteMessages) {
      this.removeMessages({ connectionId, messageIds: messageRecordsToReturn.map((msg) => msg.id) })
    }

    const queuedMessages = messageRecordsToReturn.map((messageRecord) => ({
      id: messageRecord.id,
      receivedAt: messageRecord.createdAt,
      encryptedMessage: messageRecord.message,
    }))

    return queuedMessages
  }

  public async addMessage(options: AddMessageOptions) {
    const { connectionId, payload } = options

    this.agentContext.config.logger.debug(
      `Adding message to queue for connection ${connectionId} with payload ${JSON.stringify(payload)}`
    )

    const id = utils.uuid()

    await this.messageRepository.save(
      this.agentContext,
      new MessageRecord({
        id,
        connectionId,
        message: payload,
      })
    )


    return id
  }

  public async removeMessages(options: RemoveMessagesOptions) {
    const { messageIds } = options

    this.agentContext.config.logger.debug(`Removing message ids ${messageIds}`)

    const deletePromises = messageIds.map((messageId) =>
      this.messageRepository.deleteById(this.agentContext, messageId)
    )

    await Promise.all(deletePromises)
  }
}
