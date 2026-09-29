export interface CreateContactProps {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly updatedAt: Date;
}

export interface PersistedContact {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly updatedAt: Date;
}

interface ContactState {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly updatedAt: Date;
}

/**
 * Local projection of identity events. `updatedAt` comes from the event's
 * `occurredAt` so an out-of-order delivery is discarded.
 */
export class Contact {
  private constructor(private readonly state: ContactState) {}

  static create(props: CreateContactProps): Contact {
    return new Contact({
      userId: props.userId,
      name: props.name,
      email: props.email,
      updatedAt: props.updatedAt,
    });
  }

  static fromPersistence(data: PersistedContact): Contact {
    return new Contact(data);
  }

  applyUpdate(props: {
    readonly name: string;
    readonly email: string;
    readonly updatedAt: Date;
  }): Contact {
    if (props.updatedAt.getTime() < this.state.updatedAt.getTime()) {
      return this;
    }
    return new Contact({
      userId: this.state.userId,
      name: props.name,
      email: props.email,
      updatedAt: props.updatedAt,
    });
  }

  get userId(): string {
    return this.state.userId;
  }

  get name(): string {
    return this.state.name;
  }

  get email(): string {
    return this.state.email;
  }

  get updatedAt(): Date {
    return this.state.updatedAt;
  }

  toJSON(): PersistedContact {
    return { ...this.state };
  }
}
